import { BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createCanvas, Image } from 'canvas';
import * as fs from 'fs';
import { diskStorage } from 'multer';
import * as path from 'path';
import {
  AccountMappingResult,
  ClassificationResult,
  ExtractionResult,
  JournalLineProposal,
  JournalProposal,
  PaymentProposal,
} from './types';

export class UploadFileInterceptor {
  static single() {
    fs.mkdirSync(path.join(process.cwd(), 'uploads'), { recursive: true });

    return FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (_req, file, callback) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          callback(null, `${unique}${path.extname(file.originalname)}`);
        },
      }),
    });
  }
}

export function fileToBase64(filePath: string): string {
  const file = fs.readFileSync(filePath);
  return `data:image/png;base64,${file.toString('base64')}`;
}

export async function pdfToImage(pdfPath: string): Promise<string> {
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (
    specifier: string,
  ) => Promise<{
    getDocument: (options: { data: Uint8Array }) => { promise: Promise<any> };
  }>;
  const pdfjsLib = await dynamicImport('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(pdfPath));

  (globalThis as { Image?: typeof Image }).Image = Image;

  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext('2d');

  await page.render({
    canvasContext: context,
    canvas,
    viewport,
  }).promise;

  const outputPath = path.join(process.cwd(), 'uploads', `page-${Date.now()}.png`);
  fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));

  return outputPath;
}

export function safeJsonParse(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text) as unknown;
    return ensureObject(parsed);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new BadRequestException('No valid JSON found in model response');
    }
    return ensureObject(JSON.parse(match[0]) as unknown);
  }
}

export function extractModelJson(response: Record<string, unknown>): Record<string, unknown> {
  const choices = response.choices as Array<{ message?: { content?: string } }> | undefined;
  return safeJsonParse(choices?.[0]?.message?.content ?? '{}');
}

export function normalizeExtractionResult(raw: Record<string, unknown>): ExtractionResult {
  const rawItems = raw.lineItems ?? raw.line_items;
  const lineItems = Array.isArray(rawItems)
    ? rawItems.map((item) => {
        const line = ensureObject(item);
        return {
          description: toStringValue(line.description),
          quantity: toNumber(line.quantity),
          unitPrice: toNumber(line.unitPrice ?? line.unit_price),
          taxAmount: toNumber(line.taxAmount ?? line.tax_amount),
          lineTotal: toNumber(line.lineTotal ?? line.line_total),
        };
      })
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
      throw new BadRequestException(`Account mapping line ${index + 1} is incomplete`);
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

export function validateJournalProposal(proposal: JournalProposal): JournalProposal {
  if (!proposal.journalEntry) {
    throw new BadRequestException('journalEntry is required');
  }
  if (!Array.isArray(proposal.lines) || proposal.lines.length < 2) {
    throw new BadRequestException('Journal proposal must include at least two lines');
  }

  proposal.lines.forEach((line, index) => {
    if (!line.accountId || !line.accountName) {
      throw new BadRequestException(`Journal line ${index + 1} is missing account data`);
    }
    if (!line.reason) {
      throw new BadRequestException(`Journal line ${index + 1} must include a reason`);
    }
    if (toNumber(line.debit) < 0 || toNumber(line.credit) < 0) {
      throw new BadRequestException(`Journal line ${index + 1} cannot be negative`);
    }
  });

  const debits = total(proposal.lines, 'debit');
  const credits = total(proposal.lines, 'credit');
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

export function validatePaymentProposal(proposal: PaymentProposal): PaymentProposal {
  if (!proposal.paymentRequired) {
    return proposal;
  }
  if (!['CUSTOMER_PAYMENT', 'VENDOR_PAYMENT'].includes(proposal.paymentType)) {
    throw new BadRequestException('Invalid paymentType');
  }
  if (toNumber(proposal.amount) <= 0) {
    throw new BadRequestException('Payment amount must be greater than zero');
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

function ensureObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('Expected JSON object');
  }
  return value as Record<string, unknown>;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function total(lines: JournalLineProposal[], key: 'debit' | 'credit'): number {
  return roundMoney(lines.reduce((sum, line) => sum + toNumber(line[key]), 0));
}
