import { Module } from '@nestjs/common';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { TenantModule } from '../../tenant/tenant.module';
import { LanggraphService } from './langgraph.service';
import { DatabaseSearchAgentGraph } from './agents/database-search-agent';
import { PrismaModule } from '../prisma/prisma.module';
import { DataBaseService } from '../../../database/database.service';
import { FinancialContextService } from '../financial-context.service';

@Module({
  imports: [
    RetrievalModule,
    TenantModule,
    EmbeddingsModule,  // Provides EmbeddingsService for insight storage in Financial Reasoning Agent
    PrismaModule,
  ],
  providers: [
    DataBaseService,
    LanggraphService,
    DatabaseSearchAgentGraph,
    FinancialContextService,
  ],
  exports: [LanggraphService],
})
export class LanggraphModule {}
