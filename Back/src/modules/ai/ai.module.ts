import { Module } from '@nestjs/common';
import { DataBaseModule } from '../../database/database.module';
import { TenantModule } from '../tenant/tenant.module';
import { AiController } from './ai.controller';
import { ChatbotService } from './chatbot.service';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { LanggraphModule } from './langgraph/langgraph.module';
import { RagIndexService } from './rag-index.service';
import { RetrievalModule } from './retrieval/retrieval.module';
import { ReportAttachmentService } from './report-attachment.service';

@Module({
  imports: [
    DataBaseModule,
    TenantModule,
    EmbeddingsModule,
    RetrievalModule,
    LanggraphModule,
  ],
  controllers: [AiController],
  providers: [ChatbotService, RagIndexService, ReportAttachmentService],
  exports: [RagIndexService],
})
export class AiModule {}
