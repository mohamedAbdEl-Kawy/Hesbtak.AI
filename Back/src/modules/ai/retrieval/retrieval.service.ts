import { BadRequestException, Injectable } from '@nestjs/common';
import { toPgVector } from '../database/sql';
import {
  RAG_SOURCE_TYPES,
  SourceType,
} from '../embeddings/dto/ingest-source.dto';
import { EmbeddingProviderService } from '../embeddings/embedding-provider';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext, TenantService } from '../../tenant/tenant.service';

export type RetrievalRow = {
  id: string;
  source_type: SourceType;
  source_id: string;
  chunk_index: number;
  chunk_text: string;
  metadata: Record<string, unknown>;
  similarity_score: number;
};

const ALLOWED_METADATA_FILTERS = new Set([
  'document_type',
  'section',
  'period_start',
  'period_end',
  'effective_date',
  'author',
  'approved',
]);

@Injectable()
export class RetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly embeddingProvider: EmbeddingProviderService,
  ) {}

  async retrieve(
    ctx: TenantContext,
    query: string,
    k = 8,
    similarityThreshold = 0.6,
    sourceTypes: SourceType[] = [...RAG_SOURCE_TYPES],
    filters: Record<string, unknown> = {},
  ) {
    const validSourceTypes = this.validateSourceTypes(sourceTypes);
    const validFilters = this.validateFilters(filters);
    const rows = await this.retrieveRows(
      ctx.schemaName,
      query,
      k,
      similarityThreshold,
      validSourceTypes,
      validFilters,
    );

    return {
      query,
      results: rows,
      context: this.buildContext(query, rows),
    };
  }

  private async retrieveRows(
    schemaName: string,
    query: string,
    k: number,
    similarityThreshold: number,
    sourceTypes: SourceType[],
    filters: Record<string, string>,
  ) {
    const schema = this.tenant.quote(schemaName);
    const [embedding] = await this.embeddingProvider.embedMany([query]);
    const values: unknown[] = [
      toPgVector(embedding),
      similarityThreshold,
      k,
      sourceTypes,
    ];
    const filterSql = Object.entries(filters)
      .map(([key, value]) => {
        values.push(value);
        return `AND metadata ->> '${key}' = $${values.length}`;
      })
      .join('\n');

    return this.prisma.$queryRawUnsafe<RetrievalRow[]>(
      `SELECT
        id,
        source_type,
        source_id,
        chunk_index,
        chunk_text,
        metadata,
        1 - (embedding <=> $1::vector) AS similarity_score
       FROM ${schema}.embeddings
       WHERE is_deleted = false
         AND embedding IS NOT NULL
         AND 1 - (embedding <=> $1::vector) >= $2
         AND source_type = ANY($4::text[])
         ${filterSql}
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      ...values,
    );
  }

  private validateSourceTypes(sourceTypes: SourceType[]) {
    if (
      sourceTypes.length === 0 ||
      sourceTypes.some((type) => !RAG_SOURCE_TYPES.includes(type))
    ) {
      throw new BadRequestException('Invalid RAG source type');
    }
    return sourceTypes;
  }

  private validateFilters(filters: Record<string, unknown>) {
    return Object.entries(filters).reduce<Record<string, string>>(
      (result, [key, value]) => {
        if (!ALLOWED_METADATA_FILTERS.has(key)) {
          throw new BadRequestException(`Unsupported retrieval filter: ${key}`);
        }
        if (typeof value === 'string') {
          result[key] = value;
          return result;
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
          result[key] = String(value);
          return result;
        }
        {
          throw new BadRequestException(
            `Retrieval filter ${key} must be a scalar value`,
          );
        }
      },
      {},
    );
  }

  private buildContext(query: string, rows: RetrievalRow[]) {
    if (rows.length === 0) {
      return `[DOCUMENT CONTEXT]\nNo relevant documents found.\n\n[USER QUESTION]\n${query}`;
    }

    const chunks = rows.map((row, index) => {
      const title =
        typeof row.metadata.title === 'string'
          ? row.metadata.title
          : row.source_id;
      const section =
        typeof row.metadata.section === 'string'
          ? ` | section: ${row.metadata.section}`
          : '';
      return `[SOURCE ${index + 1}] ${title}${section} | type: ${row.source_type} | id: ${row.source_id}\n${row.chunk_text}`;
    });

    return `[DOCUMENT CONTEXT]\n${chunks.join('\n\n')}\n\n[USER QUESTION]\n${query}`;
  }
}
