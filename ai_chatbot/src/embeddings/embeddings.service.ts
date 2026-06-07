import { BadRequestException, Injectable } from '@nestjs/common';
import { quoteIdentifier, toPgVector } from '../database/sql';
import { PrismaService } from '../prisma/prisma.service';
import { TenantsService } from '../tenants/tenants.service';
import { EmbeddingProviderService } from './embedding-provider';
import { IngestSourceDto } from './dto/ingest-source.dto';
import { UpsertEmbeddingsDto } from './dto/upsert-embeddings.dto';
import { SourceChunkerService } from './source-chunker.service';

@Injectable()
export class EmbeddingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantsService: TenantsService,
    private readonly embeddingProvider: EmbeddingProviderService,
    private readonly sourceChunker: SourceChunkerService,
  ) {}

  ingestSource(orgSlug: string, dto: IngestSourceDto) {
    return this.embedAndStore(orgSlug, {
      sourceType: dto.sourceType,
      sourceId: dto.sourceId,
      chunks: this.sourceChunker.build(dto.sourceType, dto.payload),
    });
  }

  async embedAndStore(orgSlug: string, dto: UpsertEmbeddingsDto) {
    const tenant = await this.tenantsService.findBySlugOrThrow(orgSlug);
    const schema = quoteIdentifier(tenant.schemaName);
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
      orgSlug,
      sourceType: dto.sourceType,
      sourceId: dto.sourceId,
      chunksStored: chunks.length,
    };
  }

  async softDeleteSource(orgSlug: string, sourceType: string, sourceId: string) {
    const tenant = await this.tenantsService.findBySlugOrThrow(orgSlug);
    const result = await this.prisma.$executeRawUnsafe(
      `UPDATE ${quoteIdentifier(tenant.schemaName)}.embeddings
       SET is_deleted = true, updated_at = now()
       WHERE source_type = $1 AND source_id = $2 AND is_deleted = false`,
      sourceType,
      sourceId,
    );

    return { orgSlug, sourceType, sourceId, chunksDeleted: result };
  }

  private validateChunkText(text: string, maxTokens: number) {
    const tokens = text.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      throw new BadRequestException('Chunk text cannot be empty');
    }
    return tokens.length > maxTokens ? tokens.slice(0, maxTokens).join(' ') : text.trim();
  }
}
