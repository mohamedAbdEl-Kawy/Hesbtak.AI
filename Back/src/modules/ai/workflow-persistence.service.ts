import { Injectable } from '@nestjs/common';
import { AccountingService } from '../accounting/accounting.service';
import { TenantContext } from '../tenant/tenant.service';
import {
  AccountMappingLine,
  InvoiceLineItem,
  PersistedWorkflowRecords,
  WorkflowPayload,
} from './types';

@Injectable()
export class WorkflowPersistenceService {
  constructor(private readonly accounting: AccountingService) {}

  async persistApprovedWorkflow(input: {
    tenant: TenantContext;
    userId: string;
    payload: WorkflowPayload;
  }): Promise<PersistedWorkflowRecords> {
    const { tenant, userId, payload } = input;

    if (
      !payload.approvedExtraction ||
      !payload.approvedClassification ||
      !payload.approvedAccountMapping
    ) {
      throw new Error('Approved extraction, classification, and mapping are required');
    }

    if (payload.approvedClassification.documentType === 'CUSTOMER_INVOICE') {
      const customerId = await this.resolveCustomerId(tenant, userId, payload);
      const invoice = await this.accounting.createInvoice(tenant, userId, {
        customerId,
        issueDate: payload.approvedExtraction.issueDate,
        dueDate: payload.approvedExtraction.dueDate || payload.approvedExtraction.issueDate,
        lines: this.toDocumentLines(
          payload.approvedExtraction.lineItems,
          payload.approvedAccountMapping.accountMappings,
        ),
      });

      const records: PersistedWorkflowRecords = {
        customerId,
        invoiceId: invoice.id,
      };

      if (payload.paymentStatus === 'paid') {
        const payment = await this.accounting.createCustomerPayment(tenant, userId, {
          entityId: invoice.id,
          amount: Number(payload.approvedExtraction.total),
          paymentMethod: 'cash',
          paymentDate:
            payload.approvedPayment?.paymentDate ||
            payload.approvedExtraction.issueDate,
          notes: 'Autonomous AI workflow customer payment',
        });
        records.paymentId = payment.id;
      }

      return records;
    }

    const vendorId = await this.resolveVendorId(tenant, userId, payload);
    const bill = await this.accounting.createVendorBill(tenant, userId, {
      vendorId,
      issueDate: payload.approvedExtraction.issueDate,
      dueDate: payload.approvedExtraction.dueDate || payload.approvedExtraction.issueDate,
      lines: this.toDocumentLines(
        payload.approvedExtraction.lineItems,
        payload.approvedAccountMapping.accountMappings,
      ),
    });

    const records: PersistedWorkflowRecords = {
      vendorId,
      vendorBillId: bill.id,
    };

    if (payload.paymentStatus === 'paid') {
      const payment = await this.accounting.createVendorPayment(tenant, userId, {
        entityId: bill.id,
        amount: Number(payload.approvedExtraction.total),
        paymentMethod: 'cash',
        paymentDate:
          payload.approvedPayment?.paymentDate || payload.approvedExtraction.issueDate,
        notes: 'Autonomous AI workflow vendor payment',
      });
      records.paymentId = payment.id;
    }

    return records;
  }

  private async resolveCustomerId(
    tenant: TenantContext,
    userId: string,
    payload: WorkflowPayload,
  ): Promise<string> {
    const proposal = payload.approvedAccountMapping?.customerProposal;

    if (proposal?.action === 'USE_EXISTING' && proposal.customerId) {
      return proposal.customerId;
    }

    const created = await this.accounting.createCustomer(tenant, userId, {
      name:
        proposal?.customerName ||
        payload.approvedExtraction?.customerName ||
        'AI-created customer',
    });

    return created.id;
  }

  private async resolveVendorId(
    tenant: TenantContext,
    userId: string,
    payload: WorkflowPayload,
  ): Promise<string> {
    const proposal = payload.approvedAccountMapping?.vendorProposal;

    if (proposal?.action === 'USE_EXISTING' && proposal.vendorId) {
      return proposal.vendorId;
    }

    const created = await this.accounting.createVendor(tenant, userId, {
      name:
        proposal?.vendorName ||
        payload.approvedExtraction?.vendorName ||
        'AI-created vendor',
    });

    return created.id;
  }

  private toDocumentLines(
    lineItems: InvoiceLineItem[],
    mappings: AccountMappingLine[],
  ) {
    return lineItems.map((line, index) => {
      const quantity = Number(line.quantity || 1);
      const unitPrice = Number(
        line.unitPrice || (line.lineTotal ? Number(line.lineTotal) / quantity : 0),
      );
      const lineSubtotal = quantity * unitPrice;
      const taxRate =
        lineSubtotal > 0 ? (Number(line.taxAmount || 0) / lineSubtotal) * 100 : 0;
      const mapping = mappings[index] ?? mappings[0];

      return {
        description: line.description || `Line ${index + 1}`,
        quantity,
        unitPrice,
        taxRate,
        accountId: mapping?.accountId,
      };
    });
  }
}
