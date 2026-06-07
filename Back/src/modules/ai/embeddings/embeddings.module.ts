import { Module } from '@nestjs/common';
import { TenantModule } from '../../tenant/tenant.module';
import { EmbeddingProviderService } from './embedding-provider';
import { EmbeddingsService } from './embeddings.service';
import { SourceChunkerService } from './source-chunker.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [TenantModule, PrismaModule],
  providers: [EmbeddingsService, EmbeddingProviderService, SourceChunkerService],
  exports: [EmbeddingsService, EmbeddingProviderService],
})
export class EmbeddingsModule {}
