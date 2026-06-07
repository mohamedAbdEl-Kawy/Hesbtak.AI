import { Module } from '@nestjs/common';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { TenantsModule } from '../tenants/tenants.module';
import { RetrievalController } from './retrieval.controller';
import { RetrievalService } from './retrieval.service';

@Module({
  imports: [EmbeddingsModule, TenantsModule],
  controllers: [RetrievalController],
  providers: [RetrievalService],
  exports: [RetrievalService],  // Exported so LanggraphModule can inject it into agents
})
export class RetrievalModule {}
