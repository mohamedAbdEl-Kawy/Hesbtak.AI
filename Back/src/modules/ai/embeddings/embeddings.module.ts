import { Module } from '@nestjs/common';
import { EmbeddingProviderService } from './embedding-provider';
import { PrivacyModule } from '../../privacy/privacy.module';

@Module({
  imports: [PrivacyModule],
  providers: [EmbeddingProviderService],
  exports: [EmbeddingProviderService],
})
export class EmbeddingsModule {}
