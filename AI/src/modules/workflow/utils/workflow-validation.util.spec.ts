import { BadRequestException } from '@nestjs/common';

import {
  normalizeExtractionResult,
  validateAccountMappingResult,
  validateJournalProposal,
  validatePaymentProposal,
} from './workflow-validation.util';

describe('workflow validation utilities', () => {
  it('normalizes snake_case extraction output into the public contract', () => {
    const result = normalizeExtractionResult({
      invoice_number: 'INV-1',
      vendor_name: 'Vendor',
      customer_name: 'Customer',
      issue_date: '2026-06-01',
      due_date: '2026-06-30',
      subtotal: '100',
      tax_amount: '14',
      total: '114',
      currency: 'EGP',
      line_items: [
        {
          description: 'Service',
          quantity: '1',
          unit_price: '100',
          line_total: '100',
        },
      ],
    });

    expect(result).toEqual({
      invoiceNumber: 'INV-1',
      vendorName: 'Vendor',
      customerName: 'Customer',
      issueDate: '2026-06-01',
      dueDate: '2026-06-30',
      subtotal: 100,
      taxAmount: 14,
      total: 114,
      currency: 'EGP',
      lineItems: [
        {
          description: 'Service',
          quantity: 1,
          unitPrice: 100,
          taxAmount: 0,
          lineTotal: 100,
        },
      ],
    });
  });

  it('rejects account mappings without confidence scores', () => {
    expect(() =>
      validateAccountMappingResult({
        customerProposal: {
          action: 'CREATE',
          customerName: 'Customer',
        },
        vendorProposal: {
          action: 'USE_EXISTING',
          vendorId: '',
          vendorName: '',
        },
        accountMappings: [
          {
            lineDescription: 'Service',
            accountId: 'acc-1',
            accountName: 'Revenue',
            confidence: 1.5,
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('accepts balanced journal proposals with reasons', () => {
    const proposal = validateJournalProposal({
      journalEntry: {
        description: 'Invoice INV-1',
        referenceType: 'CUSTOMER_INVOICE',
        date: '2026-06-01',
      },
      lines: [
        {
          accountId: 'ar',
          accountName: 'Accounts Receivable',
          debit: 114,
          credit: 0,
          reason: 'Record amount owed by customer',
        },
        {
          accountId: 'rev',
          accountName: 'Revenue',
          debit: 0,
          credit: 114,
          reason: 'Record earned revenue',
        },
      ],
    });

    expect(proposal.lines[0].debit).toBe(114);
  });

  it('rejects unbalanced journal proposals', () => {
    expect(() =>
      validateJournalProposal({
        journalEntry: {
          description: 'Invoice INV-1',
          referenceType: 'CUSTOMER_INVOICE',
          date: '2026-06-01',
        },
        lines: [
          {
            accountId: 'ar',
            accountName: 'Accounts Receivable',
            debit: 114,
            credit: 0,
            reason: 'Record amount owed by customer',
          },
          {
            accountId: 'rev',
            accountName: 'Revenue',
            debit: 0,
            credit: 100,
            reason: 'Record earned revenue',
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('validates payment journal lines as balanced', () => {
    expect(() =>
      validatePaymentProposal({
        paymentRequired: true,
        paymentType: 'CUSTOMER_PAYMENT',
        amount: 114,
        paymentDate: '2026-06-01',
        journalLines: [
          {
            accountId: 'cash',
            accountName: 'Cash',
            debit: 114,
            credit: 0,
            reason: 'Record received cash',
          },
          {
            accountId: 'ar',
            accountName: 'Accounts Receivable',
            debit: 0,
            credit: 113,
            reason: 'Clear customer receivable',
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });
});
