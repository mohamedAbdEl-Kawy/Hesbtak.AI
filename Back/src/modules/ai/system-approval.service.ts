import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AccountMappingResult,
  ClassificationResult,
  ExtractionResult,
  JournalProposal,
  MappingContext,
  PaymentProposal,
  SystemApprovalRecord,
  SystemApprovalStep,
  WorkflowPayload,
} from './types';
import {
  validateAccountMappingResult,
  validateClassificationResult,
  validateJournalProposal,
  validatePaymentProposal,
} from './ai-utils';

const MIN_MAPPING_CONFIDENCE = 0.7;

@Injectable()
export class SystemApprovalService {
  approveExtraction(extraction: ExtractionResult, payload: WorkflowPayload) {
    const rules = [
      'invoice total must be greater than zero',
      'issue date must be available',
      'at least one line item must be available',
      'customer invoices require customer name',
      'vendor bills require vendor name',
    ];

    this.require(extraction.total > 0, 'Invoice total must be greater than zero');
    this.require(Boolean(extraction.issueDate), 'Issue date is required');
    this.require(
      Array.isArray(extraction.lineItems) && extraction.lineItems.length > 0,
      'At least one line item is required',
    );

    if (payload.documentSide === 'customer') {
      this.require(Boolean(extraction.customerName), 'Customer name is required');
    }

    if (payload.documentSide === 'vendor') {
      this.require(Boolean(extraction.vendorName), 'Vendor name is required');
    }

    return this.record('EXTRACTION', rules);
  }

  approveClassification(
    classification: ClassificationResult,
    payload: WorkflowPayload,
  ) {
    const approved = validateClassificationResult(classification);
    const rules = [
      'document type must match document side',
      'accounting action must match document side',
      'payment requirement must match payment status',
      'required party flags must match document side',
    ];

    if (payload.documentSide === 'customer') {
      this.require(
        approved.documentType === 'CUSTOMER_INVOICE',
        'Customer side documents must classify as CUSTOMER_INVOICE',
      );
      this.require(
        approved.accountingAction === 'REVENUE',
        'Customer side documents must classify as REVENUE',
      );
      this.require(approved.requiresCustomer, 'Customer invoice requires customer');
      this.require(!approved.requiresVendor, 'Customer invoice must not require vendor');
    }

    if (payload.documentSide === 'vendor') {
      this.require(
        approved.documentType === 'VENDOR_BILL',
        'Vendor side documents must classify as VENDOR_BILL',
      );
      this.require(
        approved.accountingAction === 'EXPENSE',
        'Vendor side documents must classify as EXPENSE',
      );
      this.require(approved.requiresVendor, 'Vendor bill requires vendor');
      this.require(!approved.requiresCustomer, 'Vendor bill must not require customer');
    }

    this.require(
      approved.requiresPayment === (payload.paymentStatus === 'unpaid'),
      'requiresPayment must be true only for unpaid documents',
    );

    return this.record('CLASSIFICATION', rules);
  }

  approveAccountMapping(
    mapping: AccountMappingResult,
    payload: WorkflowPayload,
    context: MappingContext,
  ) {
    const approved = validateAccountMappingResult(mapping);
    const accountIds = new Set(context.accounts.map((account) => account.id));
    const customerIds = new Set(context.customers.map((customer) => customer.id));
    const vendorIds = new Set(context.vendors.map((vendor) => vendor.id));
    const rules = [
      'all mapped accounts must exist in tenant chart of accounts',
      `each mapping confidence must be at least ${MIN_MAPPING_CONFIDENCE}`,
      'required existing customer/vendor IDs must exist in tenant data',
      'required CREATE customer/vendor proposals must include a name',
    ];

    this.require(
      approved.accountMappings.length > 0,
      'At least one account mapping is required',
    );

    approved.accountMappings.forEach((line, index) => {
      this.require(
        accountIds.has(line.accountId),
        `Account mapping line ${index + 1} references an unknown account`,
      );
      this.require(
        line.confidence >= MIN_MAPPING_CONFIDENCE,
        `Account mapping line ${index + 1} confidence is below ${MIN_MAPPING_CONFIDENCE}`,
      );
    });

    if (payload.approvedClassification?.requiresCustomer) {
      if (approved.customerProposal.action === 'USE_EXISTING') {
        this.require(
          Boolean(approved.customerProposal.customerId) &&
            customerIds.has(approved.customerProposal.customerId ?? ''),
          'Existing customer proposal must reference a valid customer',
        );
      } else {
        this.require(
          Boolean(approved.customerProposal.customerName),
          'Create customer proposal must include customerName',
        );
      }
    }

    if (payload.approvedClassification?.requiresVendor) {
      if (approved.vendorProposal.action === 'USE_EXISTING') {
        this.require(
          Boolean(approved.vendorProposal.vendorId) &&
            vendorIds.has(approved.vendorProposal.vendorId ?? ''),
          'Existing vendor proposal must reference a valid vendor',
        );
      } else {
        this.require(
          Boolean(approved.vendorProposal.vendorName),
          'Create vendor proposal must include vendorName',
        );
      }
    }

    return this.record('ACCOUNT_MAPPING', rules);
  }

  approveJournal(
    journal: JournalProposal,
    context: MappingContext,
  ) {
    const approved = validateJournalProposal(journal);
    const accountIds = new Set(context.accounts.map((account) => account.id));
    const rules = [
      'journal must be balanced',
      'every journal line must include a reason',
      'every journal account must exist in tenant chart of accounts',
      'journal entry date and description must be available',
    ];

    this.require(Boolean(approved.journalEntry.date), 'Journal date is required');
    this.require(
      Boolean(approved.journalEntry.description),
      'Journal description is required',
    );

    approved.lines.forEach((line, index) => {
      this.require(
        accountIds.has(line.accountId),
        `Journal line ${index + 1} references an unknown account`,
      );
    });

    return this.record('JOURNAL', rules);
  }

  approvePayment(
    payment: PaymentProposal,
    payload: WorkflowPayload,
    context: MappingContext,
  ) {
    const approved = validatePaymentProposal(payment);
    const accountIds = new Set(context.accounts.map((account) => account.id));
    const rules = [
      'payment is only allowed when paymentStatus is paid',
      'payment amount must match invoice total',
      'payment date must be available',
      'payment journal lines must be balanced',
      'every payment account must exist in tenant chart of accounts',
    ];

    this.require(payload.paymentStatus === 'paid', 'Payment proposal is not allowed');
    this.require(Boolean(approved.paymentDate), 'Payment date is required');
    this.require(
      Math.abs(Number(approved.amount) - Number(payload.approvedExtraction?.total ?? 0)) <
        0.01,
      'Payment amount must equal extracted invoice total',
    );

    approved.journalLines.forEach((line, index) => {
      this.require(
        accountIds.has(line.accountId),
        `Payment journal line ${index + 1} references an unknown account`,
      );
    });

    return this.record('PAYMENT', rules);
  }

  private record(step: SystemApprovalStep, rules: string[]): SystemApprovalRecord {
    return {
      step,
      approved: true,
      checkedAt: new Date().toISOString(),
      rules,
    };
  }

  private require(condition: boolean, message: string) {
    if (!condition) {
      throw new BadRequestException(`System approval failed: ${message}`);
    }
  }
}
