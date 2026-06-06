import { BadRequestException } from '@nestjs/common';
import {
  normalizeExtractionResult,
  validateAccountMappingResult,
  validateJournalProposal,
  validatePaymentProposal,
} from './ai-utils';

describe('AI workflow validation', () => {
  it('normalizes extracted invoice fields from snake_case', () => {
    expect(
      normalizeExtractionResult({
        invoice_number: 'INV-1',
        vendor_name: 'Vendor',
        customer_name: 'Customer',
        issue_date: '2026-06-06',
        due_date: '2026-06-20',
        subtotal: '100',
        tax_amount: '14',
        total: '114',
        currency: 'EGP',
        line_items: [{ description: 'Service', line_total: '114' }],
      }),
    ).toMatchObject({
      invoiceNumber: 'INV-1',
      vendorName: 'Vendor',
      customerName: 'Customer',
      taxAmount: 14,
      total: 114,
      lineItems: [{ description: 'Service', lineTotal: 114 }],
    });
  });

  it('rejects account mappings without a valid confidence score', () => {
    expect(() =>
      validateAccountMappingResult({
        customerProposal: { action: 'CREATE', customerName: 'Customer' },
        vendorProposal: { action: 'CREATE', vendorName: 'Vendor' },
        accountMappings: [
          {
            lineDescription: 'Service',
            accountId: 'revenue',
            accountName: 'Revenue',
            confidence: 2,
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects unbalanced journal proposals', () => {
    expect(() =>
      validateJournalProposal({
        journalEntry: {
          description: 'Invoice INV-1',
          referenceType: 'CUSTOMER_INVOICE',
          date: '2026-06-06',
        },
        lines: [
          {
            accountId: 'ar',
            accountName: 'Accounts Receivable',
            debit: 114,
            credit: 0,
            reason: 'Record receivable',
          },
          {
            accountId: 'revenue',
            accountName: 'Revenue',
            debit: 0,
            credit: 100,
            reason: 'Record revenue',
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects unbalanced payment proposals', () => {
    expect(() =>
      validatePaymentProposal({
        paymentRequired: true,
        paymentType: 'CUSTOMER_PAYMENT',
        amount: 114,
        paymentDate: '2026-06-06',
        journalLines: [
          {
            accountId: 'cash',
            accountName: 'Cash',
            debit: 114,
            credit: 0,
            reason: 'Receive cash',
          },
          {
            accountId: 'ar',
            accountName: 'Accounts Receivable',
            debit: 0,
            credit: 100,
            reason: 'Clear receivable',
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });
});
