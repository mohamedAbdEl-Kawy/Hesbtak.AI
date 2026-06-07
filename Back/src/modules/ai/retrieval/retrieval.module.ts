import { Module } from '@nestjs/common';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { TenantModule } from '../../tenant/tenant.module';
import { RetrievalService } from './retrieval.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [EmbeddingsModule, TenantModule, PrismaModule],
  providers: [RetrievalService],
  exports: [RetrievalService],  // Exported so LanggraphModule can inject it into agents
})
export class RetrievalModule {}
