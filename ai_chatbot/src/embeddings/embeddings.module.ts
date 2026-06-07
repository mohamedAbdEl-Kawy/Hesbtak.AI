import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { EmbeddingProviderService } from './embedding-provider';
import { EmbeddingsController } from './embeddings.controller';
import { EmbeddingsService } from './embeddings.service';
import { SourceChunkerService } from './source-chunker.service';

@Module({
  imports: [HttpModule, TenantsModule],
  controllers: [EmbeddingsController],
  providers: [EmbeddingsService, EmbeddingProviderService, SourceChunkerService],
  exports: [EmbeddingsService, EmbeddingProviderService],
})
export class EmbeddingsModule {}
