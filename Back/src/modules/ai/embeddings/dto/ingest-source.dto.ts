import { IsIn, IsObject, IsString, MaxLength } from 'class-validator';

export const RAG_SOURCE_TYPES = [
  'onboarding_context',
  'uploaded_document',
  'ocr_document',
  'report_commentary',
  'approved_insight',
  'policy_or_regulation',
] as const;

export type SourceType = (typeof RAG_SOURCE_TYPES)[number];

export class IngestSourceDto {
  @IsIn(RAG_SOURCE_TYPES)
  sourceType!: SourceType;

  @IsString()
  @MaxLength(120)
  sourceId!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}
