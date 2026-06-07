import { IsIn, IsObject, IsString, MaxLength } from 'class-validator';

export const SOURCE_TYPES = [
  'invoice_transaction',
  'vendor_bill_transaction',
  'customer_payment',
  'vendor_payment',
  'journal_entry',
  'anomaly_flag',            // legacy alias kept for backward compat
  'anomaly_flagged_transactions',
  'onboarding_questionnaire',
  'quarter_live_report',
  'ai_insights',
  'account',
  'customer',
  'vendor',
  'expense',
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export class IngestSourceDto {
  @IsIn(SOURCE_TYPES)
  sourceType!: SourceType;

  @IsString()
  @MaxLength(120)
  sourceId!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}
