import { Module } from '@nestjs/common';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { TenantsModule } from '../tenants/tenants.module';
import { LanggraphController } from './langgraph.controller';
import { LanggraphService } from './langgraph.service';
import { DatabaseSearchAgentGraph } from './agents/database-search-agent';

@Module({
  imports: [
    RetrievalModule,
    TenantsModule,
    EmbeddingsModule,  // Provides EmbeddingsService for insight storage in Financial Reasoning Agent
  ],
  controllers: [LanggraphController],
  providers: [LanggraphService, DatabaseSearchAgentGraph],
})
export class LanggraphModule {}
