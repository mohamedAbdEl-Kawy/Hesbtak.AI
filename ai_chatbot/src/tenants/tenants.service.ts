import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { quoteIdentifier, schemaNameForSlug } from '../database/sql';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async provision(orgSlug: string, plan = 'starter') {
    const schemaName = schemaNameForSlug(orgSlug);
    const quotedSchema = quoteIdentifier(schemaName);

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS ${quotedSchema}`);
      await tx.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector');
      await tx.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pgcrypto');
      await tx.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS ${quotedSchema}.embeddings (
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
        )
      `);
      await tx.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_${schemaName}_emb_ivfflat
        ON ${quotedSchema}.embeddings
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
      `);
      await tx.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_${schemaName}_emb_meta
        ON ${quotedSchema}.embeddings USING gin (metadata)
      `);
      await tx.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_${schemaName}_source
        ON ${quotedSchema}.embeddings (source_type, source_id)
      `);
      await tx.organization.upsert({
        where: { orgSlug },
        update: { schemaName, plan, isActive: true },
        create: { orgSlug, schemaName, plan },
      });
    });

    return this.findBySlugOrThrow(orgSlug);
  }

  list() {
    return this.prisma.organization.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findBySlugOrThrow(orgSlug: string) {
    const tenant = await this.prisma.organization.findUnique({ where: { orgSlug } });
    if (!tenant || !tenant.isActive) {
      throw new NotFoundException(`Tenant not found: ${orgSlug}`);
    }
    return tenant;
  }
}
