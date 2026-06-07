import { BadRequestException, Injectable } from '@nestjs/common';
import { quoteIdentifier, toPgVector } from '../database/sql';
import { EmbeddingProviderService } from '../embeddings/embedding-provider';
import { tier2SystemPrompt } from '../langgraph/langgraph-prompts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantsService } from '../tenants/tenants.service';
import { RetrieveDto } from './dto/retrieve.dto';

type RetrievalRow = {
  id: string;
  source_type: string;
  source_id: string;
  chunk_index: number;
  chunk_text: string;
  metadata: Record<string, unknown>;
  similarity_score: number;
};

export const SOURCE_TYPES = [
  'invoice_transaction',
  'vendor_bill_transaction',
  'customer_payment',
  'vendor_payment',
  'journal_entry',
  'anomaly_flag',
  'anomaly_flagged_transactions',
  'onboarding_questionnaire',
  'quarter_live_report',
  'ai_insights',
];

const ALLOWED_METADATA_FILTERS = new Set([
  'source_type',
  'quarter',
  'fiscal_year',
  'customer_name',
  'vendor_name',
  'invoice_number',
  'bill_number',
  'payment_date',
  'issue_date',
  'due_date',
  'status',
  'currency',
  'anomaly_score',
  'analysis_type',
  'section',
]);

@Injectable()
export class RetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantsService: TenantsService,
    private readonly embeddingProvider: EmbeddingProviderService,
  ) { }

  // ─── Generic retrieval ────────────────────────────────────────────────────

  async retrieve(
    orgSlug: string,
    query: string,
    k = 10,
    similarityThreshold = 0.65,
  ) {
    const tenant = await this.tenantsService.findBySlugOrThrow(orgSlug);

    const rows = await this.retrieveRows(
      tenant.schemaName,
      query,
      k,
      similarityThreshold,
    );

    return {
      query,
      results: rows,
      context: this.buildContext(query, rows),
    };
  }

  // ─── Source-type-filtered retrieval ───────────────────────────────────────

  /**
   * Retrieves chunks filtered to a specific source_type.
   * Used by the Financial Reasoning Agent to pull targeted context.
   */
  sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  async retrieveBySourceType(
    orgSlug: string,
    sourceType: string,
    query: string,
    k = 8,
    similarityThreshold = 0.60,
  ): Promise<{ results: RetrievalRow[]; context: string }> {
    const tenant = await this.tenantsService.findBySlugOrThrow(orgSlug);
    const schema = quoteIdentifier(tenant.schemaName);
    console.log("testing ", query, sourceType, k, similarityThreshold)
    let embedding: number[] = [];
    for (let i = 0; i < 100; i++) {
      try {
        [embedding] = await this.embeddingProvider.embedMany([query]);
      } catch (err) {

        await this.sleep(1500);
      }
    }

    const vector = toPgVector(embedding);

    const rows = await this.prisma.$queryRawUnsafe<RetrievalRow[]>(
      `
      SELECT
        id,
        source_type,
        source_id,
        chunk_index,
        chunk_text,
        metadata,
        1 - (embedding <=> $1::vector) AS similarity_score
      FROM ${schema}.embeddings
      WHERE
        is_deleted = false
        AND embedding IS NOT NULL
        AND source_type = $2
        AND 1 - (embedding <=> $1::vector) >= $3
      ORDER BY embedding <=> $1::vector
      LIMIT $4
      `,
      vector,
      sourceType,
      similarityThreshold,
      k,
    );

    return {
      results: rows,
      context: this.buildContext(query, rows),
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async retrieveRows(
    schemaName: string,
    query: string,
    k: number,
    similarityThreshold: number,
  ): Promise<RetrievalRow[]> {
    const schema = quoteIdentifier(schemaName);

    const [embedding] = await this.embeddingProvider.embedMany([query]);
    const vector = toPgVector(embedding);

    return this.prisma.$queryRawUnsafe<RetrievalRow[]>(
      `
      SELECT
        id,
        source_type,
        source_id,
        chunk_index,
        chunk_text,
        metadata,
        1 - (embedding <=> $1::vector) AS similarity_score
      FROM ${schema}.embeddings
      WHERE
        is_deleted = false
        AND embedding IS NOT NULL
        AND 1 - (embedding <=> $1::vector) >= $2
      ORDER BY embedding <=> $1::vector
      LIMIT $3
      `,
      vector,
      similarityThreshold,
      k,
    );
  }

  private buildContext(query: string, rows: RetrievalRow[]): string {
    if (rows.length === 0) {
      return `[RETRIEVED CONTEXT]\n\nNo relevant documents found.\n\n[USER QUESTION]\n\n${query}`;
    }

    return `
[RETRIEVED CONTEXT]

${rows
        .map(
          (row, i) =>
            `Chunk ${i + 1} (${row.source_type} | score: ${Number(row.similarity_score).toFixed(3)})\n${row.chunk_text}`,
        )
        .join('\n\n')}

[USER QUESTION]

${query}
`;
  }
}