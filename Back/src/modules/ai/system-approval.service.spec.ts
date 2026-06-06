import { BadRequestException } from '@nestjs/common';
import { SystemApprovalService } from './system-approval.service';

describe('SystemApprovalService', () => {
  let service: SystemApprovalService;

  beforeEach(() => {
    service = new SystemApprovalService();
  });

  it('approves extraction only when required persistence fields exist', () => {
    const approval = service.approveExtraction(
      {
        invoiceNumber: 'INV-1',
        vendorName: '',
        customerName: 'Acme',
        issueDate: '2026-06-06',
        dueDate: '2026-06-20',
        subtotal: 100,
        taxAmount: 14,
        total: 114,
        currency: 'EGP',
        lineItems: [{ description: 'Service', lineTotal: 114 }],
      },
      { documentSide: 'customer', paymentStatus: 'paid' },
    );

    expect(approval).toMatchObject({ step: 'EXTRACTION', approved: true });
  });

  it('rejects classification that conflicts with document side', () => {
    expect(() =>
      service.approveClassification(
        {
          documentType: 'VENDOR_BILL',
          accountingAction: 'EXPENSE',
          requiresPayment: false,
          requiresCustomer: false,
          requiresVendor: true,
        },
        { documentSide: 'customer', paymentStatus: 'paid' },
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects low-confidence account mappings', () => {
    expect(() =>
      service.approveAccountMapping(
        {
          customerProposal: {
            action: 'USE_EXISTING',
            customerId: 'cust-1',
            customerName: 'Acme',
          },
          vendorProposal: { action: 'CREATE', vendorName: '' },
          accountMappings: [
            {
              lineDescription: 'Service',
              accountId: 'revenue',
              accountName: 'Revenue',
              confidence: 0.5,
            },
          ],
        },
        {
          documentSide: 'customer',
          paymentStatus: 'paid',
          approvedClassification: {
            documentType: 'CUSTOMER_INVOICE',
            accountingAction: 'REVENUE',
            requiresPayment: false,
            requiresCustomer: true,
            requiresVendor: false,
          },
        },
        {
          accounts: [{ id: 'revenue', name: 'Revenue' }],
          customers: [{ id: 'cust-1', name: 'Acme' }],
          vendors: [],
        },
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects payment amounts that do not match invoice total', () => {
    expect(() =>
      service.approvePayment(
        {
          paymentRequired: true,
          paymentType: 'CUSTOMER_PAYMENT',
          amount: 100,
          paymentDate: '2026-06-06',
          journalLines: [
            {
              accountId: 'cash',
              accountName: 'Cash',
              debit: 100,
              credit: 0,
              reason: 'Receive cash',
            },
            {
              accountId: 'ar',
              accountName: 'Accounts Receivable',
              debit: 0,
              credit: 100,
              reason: 'Clear AR',
            },
          ],
        },
        {
          documentSide: 'customer',
          paymentStatus: 'paid',
          approvedExtraction: {
            invoiceNumber: 'INV-1',
            vendorName: '',
            customerName: 'Acme',
            issueDate: '2026-06-06',
            dueDate: '2026-06-20',
            subtotal: 100,
            taxAmount: 14,
            total: 114,
            currency: 'EGP',
            lineItems: [{ description: 'Service' }],
          },
        },
        {
          accounts: [
            { id: 'cash', name: 'Cash' },
            { id: 'ar', name: 'Accounts Receivable' },
          ],
          customers: [],
          vendors: [],
        },
      ),
    ).toThrow(BadRequestException);
  });
});
