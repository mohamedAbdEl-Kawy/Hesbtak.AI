import { Module } from '@nestjs/common';
import { LanggraphService } from './langgraph.service';
import { DatabaseSearchAgentGraph } from './agents/database-search-agent';
import { PrismaModule } from '../prisma/prisma.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { DatabaseCatalogService } from '../database-catalog/database-catalog.service';
import { ProductGuideCatalogService } from '../product-guide/product-guide-catalog.service';
import { PrivacyModule } from '../../privacy/privacy.module';

@Module({
  imports: [KnowledgeModule, PrismaModule, PrivacyModule],
  providers: [
    LanggraphService,
    DatabaseSearchAgentGraph,
    DatabaseCatalogService,
    ProductGuideCatalogService,
  ],
  exports: [LanggraphService],
})
export class LanggraphModule {}
