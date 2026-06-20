import { Module } from '@nestjs/common';
import { DataBaseModule } from '../../database/database.module';
import { AnonymizationService } from './anonymization.service';
import { PrivacyContextService } from './privacy-context.service';

@Module({
  imports: [DataBaseModule],
  providers: [PrivacyContextService, AnonymizationService],
  exports: [PrivacyContextService, AnonymizationService],
})
export class PrivacyModule {}
