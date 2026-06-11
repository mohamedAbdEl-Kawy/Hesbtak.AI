import { Injectable } from '@nestjs/common';
import { DataBaseService } from '../../database/database.service';
import { TenantContext, TenantService } from '../tenant/tenant.service';
import { RAG_SOURCE_TYPES } from './embeddings/dto/ingest-source.dto';
import { EmbeddingsService } from './embeddings/embeddings.service';

@Injectable()
export class RagIndexService {
  constructor(
    private readonly db: DataBaseService,
    private readonly tenant: TenantService,
    private readonly embeddings: EmbeddingsService,
  ) {}

  async reindexTenant(ctx: TenantContext) {
    await this.embeddings.ensureStore(ctx);
    const schema = this.tenant.quote(ctx.schemaName);

    await this.db.$executeRawUnsafe(
      `UPDATE ${schema}.embeddings
       SET is_deleted = true, updated_at = now()
       WHERE is_deleted = false
         AND source_type <> ALL($1::text[])`,
      [...RAG_SOURCE_TYPES],
    );

    const rows = await this.db.$queryRawUnsafe<
      { question_key: string; answer: string }[]
    >(
      `SELECT question_key, answer
       FROM ${schema}.onboarding_responses
       ORDER BY created_at, question_key`,
    );

    if (rows.length > 0) {
      await this.embeddings.ingestSource(ctx, {
        sourceType: 'onboarding_context',
        sourceId: 'organization-onboarding',
        payload: {
          title: 'Organization onboarding context',
          document_type: 'onboarding',
          sections: Object.fromEntries(
            rows.map((row) => [row.question_key, row.answer]),
          ),
        },
      });
    } else {
      await this.embeddings.softDeleteSource(
        ctx,
        'onboarding_context',
        'organization-onboarding',
      );
    }

    return {
      indexed: rows.length > 0 ? 1 : 0,
      retiredLegacySources: true,
      status: await this.status(ctx),
    };
  }

  async status(ctx: TenantContext) {
    await this.embeddings.ensureStore(ctx);
    const schema = this.tenant.quote(ctx.schemaName);
    const rows = await this.db.$queryRawUnsafe<
      { source_type: string; count: bigint; last_updated: Date }[]
    >(
      `SELECT source_type, COUNT(*)::bigint AS count,
        MAX(updated_at) AS last_updated
       FROM ${schema}.embeddings
       WHERE is_deleted = false
       GROUP BY source_type
       ORDER BY source_type`,
    );
    return rows.map((row) => ({ ...row, count: Number(row.count) }));
  }
}
