import { BadRequestException } from '@nestjs/common';

import {
  AccountMappingResult,
  ClassificationResult,
  ExtractionResult,
  JournalLineProposal,
  JournalProposal,
  PaymentProposal,
} from '../types/workflow.types';

const toNumber = (value: unknown): number => {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
};

const toStringValue = (value: unknown): string =>
  typeof value === 'string' ? value : '';

export function normalizeExtractionResult(
  raw: Record<string, any>,
): ExtractionResult {
  const lineItems = Array.isArray(raw.lineItems ?? raw.line_items)
    ? (raw.lineItems ?? raw.line_items).map((item: Record<string, any>) => ({
        description: toStringValue(item.description),
        quantity: toNumber(item.quantity),
        unitPrice: toNumber(item.unitPrice ?? item.unit_price),
        taxAmount: toNumber(item.taxAmount ?? item.tax_amount),
        lineTotal: toNumber(item.lineTotal ?? item.line_total),
      }))
    : [];

  return {
    invoiceNumber: toStringValue(raw.invoiceNumber ?? raw.invoice_number),
    vendorName: toStringValue(raw.vendorName ?? raw.vendor_name),
    customerName: toStringValue(raw.customerName ?? raw.customer_name),
    issueDate: toStringValue(raw.issueDate ?? raw.issue_date),
    dueDate: toStringValue(raw.dueDate ?? raw.due_date),
    subtotal: toNumber(raw.subtotal),
    taxAmount: toNumber(raw.taxAmount ?? raw.tax_amount),
    total: toNumber(raw.total),
    currency: toStringValue(raw.currency),
    lineItems,
  };
}

export function validateClassificationResult(
  result: ClassificationResult,
): ClassificationResult {
  if (!['CUSTOMER_INVOICE', 'VENDOR_BILL'].includes(result.documentType)) {
    throw new BadRequestException('Invalid documentType in classification');
  }

  if (!['REVENUE', 'EXPENSE'].includes(result.accountingAction)) {
    throw new BadRequestException('Invalid accountingAction in classification');
  }

  return {
    documentType: result.documentType,
    accountingAction: result.accountingAction,
    requiresPayment: Boolean(result.requiresPayment),
    requiresCustomer: Boolean(result.requiresCustomer),
    requiresVendor: Boolean(result.requiresVendor),
  };
}

export function validateAccountMappingResult(
  result: AccountMappingResult,
): AccountMappingResult {
  if (!Array.isArray(result.accountMappings)) {
    throw new BadRequestException('accountMappings must be an array');
  }

  result.accountMappings.forEach((line, index) => {
    if (!line.lineDescription || !line.accountId || !line.accountName) {
      throw new BadRequestException(
        `Account mapping line ${index + 1} is missing required fields`,
      );
    }

    if (
      typeof line.confidence !== 'number' ||
      line.confidence < 0 ||
      line.confidence > 1
    ) {
      throw new BadRequestException(
        `Account mapping line ${index + 1} must include confidence from 0 to 1`,
      );
    }
  });

  return result;
}

export function totalDebits(lines: JournalLineProposal[]): number {
  return roundMoney(
    lines.reduce((sum, line) => sum + toNumber(line.debit), 0),
  );
}

export function totalCredits(lines: JournalLineProposal[]): number {
  return roundMoney(
    lines.reduce((sum, line) => sum + toNumber(line.credit), 0),
  );
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function validateJournalProposal(
  proposal: JournalProposal,
): JournalProposal {
  if (!proposal.journalEntry) {
    throw new BadRequestException('journalEntry is required');
  }

  if (!Array.isArray(proposal.lines) || proposal.lines.length < 2) {
    throw new BadRequestException('Journal proposal must include at least two lines');
  }

  proposal.lines.forEach((line, index) => {
    if (!line.accountId || !line.accountName) {
      throw new BadRequestException(
        `Journal line ${index + 1} is missing account information`,
      );
    }

    if (!line.reason) {
      throw new BadRequestException(
        `Journal line ${index + 1} must include a reason`,
      );
    }

    if (toNumber(line.debit) < 0 || toNumber(line.credit) < 0) {
      throw new BadRequestException(
        `Journal line ${index + 1} cannot contain negative amounts`,
      );
    }
  });

  const debits = totalDebits(proposal.lines);
  const credits = totalCredits(proposal.lines);

  if (debits !== credits) {
    throw new BadRequestException(
      `Unbalanced journal proposal: debits ${debits} do not equal credits ${credits}`,
    );
  }

  return {
    journalEntry: proposal.journalEntry,
    lines: proposal.lines.map((line) => ({
      accountId: line.accountId,
      accountName: line.accountName,
      debit: roundMoney(toNumber(line.debit)),
      credit: roundMoney(toNumber(line.credit)),
      reason: line.reason,
    })),
  };
}

export function validatePaymentProposal(
  proposal: PaymentProposal,
): PaymentProposal {
  if (!proposal.paymentRequired) {
    return proposal;
  }

  if (!['CUSTOMER_PAYMENT', 'VENDOR_PAYMENT'].includes(proposal.paymentType)) {
    throw new BadRequestException('Invalid paymentType');
  }

  if (toNumber(proposal.amount) <= 0) {
    throw new BadRequestException('Payment amount must be greater than zero');
  }

  if (!Array.isArray(proposal.journalLines)) {
    throw new BadRequestException('payment journalLines must be an array');
  }

  validateJournalProposal({
    journalEntry: {
      description: 'Payment validation',
      referenceType: proposal.paymentType,
      date: proposal.paymentDate,
    },
    lines: proposal.journalLines,
  });

  return proposal;
}
