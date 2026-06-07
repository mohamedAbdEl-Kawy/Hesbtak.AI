import { BadRequestException, Injectable } from '@nestjs/common';
import { toPgVector } from '../database/sql';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext, TenantService } from '../../tenant/tenant.service';
import { EmbeddingProviderService } from './embedding-provider';
import { IngestSourceDto } from './dto/ingest-source.dto';
import { UpsertEmbeddingsDto } from './dto/upsert-embeddings.dto';
import { SourceChunkerService } from './source-chunker.service';

@Injectable()
export class EmbeddingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly embeddingProvider: EmbeddingProviderService,
    private readonly sourceChunker: SourceChunkerService,
  ) {}

  ingestSource(ctx: TenantContext, dto: IngestSourceDto) {
    return this.embedAndStore(ctx, {
      sourceType: dto.sourceType,
      sourceId: dto.sourceId,
      chunks: this.sourceChunker.build(dto.sourceType, dto.payload),
    });
  }

  async embedAndStore(ctx: TenantContext, dto: UpsertEmbeddingsDto) {
    await this.ensureStore(ctx);
    const schema = this.tenant.quote(ctx.schemaName);
    const chunks = dto.chunks
      .slice()
      .sort((left, right) => left.chunkIndex - right.chunkIndex)
      .map((chunk) => ({
        ...chunk,
        text: this.validateChunkText(chunk.text, dto.maxTokens ?? 512),
        metadata: {
          source_type: dto.sourceType,
          ...chunk.metadata,
        },
      }));

    const uniqueIndexes = new Set(chunks.map((chunk) => chunk.chunkIndex));
    if (uniqueIndexes.size !== chunks.length) {
      throw new BadRequestException('Chunk indexes must be unique within a source');
    }

    const vectors = await this.embeddingProvider.embedMany(chunks.map((chunk) => chunk.text));

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE ${schema}.embeddings
         SET is_deleted = true, updated_at = now()
         WHERE source_type = $1 AND source_id = $2 AND is_deleted = false`,
        dto.sourceType,
        dto.sourceId,
      );

      for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i];
        await tx.$executeRawUnsafe(
          `INSERT INTO ${schema}.embeddings
             (source_type, source_id, chunk_index, chunk_total, chunk_text, embedding, metadata)
           VALUES ($1, $2, $3, $4, $5, $6::vector, $7::jsonb)
           ON CONFLICT (source_type, source_id, chunk_index)
           DO UPDATE SET
             chunk_total = EXCLUDED.chunk_total,
             chunk_text = EXCLUDED.chunk_text,
             embedding = EXCLUDED.embedding,
             metadata = EXCLUDED.metadata,
             updated_at = now(),
             is_deleted = false`,
          dto.sourceType,
          dto.sourceId,
          chunk.chunkIndex,
          chunks.length,
          chunk.text,
          toPgVector(vectors[i]),
          JSON.stringify(chunk.metadata),
        );
      }
    });

    return {
      organizationId: ctx.organizationId,
      sourceType: dto.sourceType,
      sourceId: dto.sourceId,
      chunksStored: chunks.length,
    };
  }

  async softDeleteSource(
    ctx: TenantContext,
    sourceType: string,
    sourceId: string,
  ) {
    await this.ensureStore(ctx);
    const result = await this.prisma.$executeRawUnsafe(
      `UPDATE ${this.tenant.quote(ctx.schemaName)}.embeddings
       SET is_deleted = true, updated_at = now()
       WHERE source_type = $1 AND source_id = $2 AND is_deleted = false`,
      sourceType,
      sourceId,
    );

    return {
      organizationId: ctx.organizationId,
      sourceType,
      sourceId,
      chunksDeleted: result,
    };
  }

  async ensureStore(ctx: TenantContext) {
    const schema = this.tenant.quote(ctx.schemaName);
    await this.prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector');
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ${schema}.embeddings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_total INTEGER,
        chunk_text TEXT NOT NULL,
        embedding vector(1024),
        metadata JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        is_deleted BOOLEAN DEFAULT false,
        CONSTRAINT uq_source_chunk UNIQUE (source_type, source_id, chunk_index)
      );
      CREATE INDEX IF NOT EXISTS embeddings_source_idx
        ON ${schema}.embeddings (source_type, source_id);
      CREATE INDEX IF NOT EXISTS embeddings_metadata_idx
        ON ${schema}.embeddings USING gin (metadata);
    `);
  }

  private validateChunkText(text: string, maxTokens: number) {
    const tokens = text.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      throw new BadRequestException('Chunk text cannot be empty');
    }
    return tokens.length > maxTokens ? tokens.slice(0, maxTokens).join(' ') : text.trim();
  }
}
