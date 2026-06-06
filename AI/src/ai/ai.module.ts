import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClassificationService } from './services/classification.service';
import { AccountMappingService } from './services/account-mapping.service';
import { QwenService } from './services/qwen.service';
import { JournalEntryService } from './services/journal-entry.service';
import { PaymentService } from './services/payment.service';

@Module({
  imports: [ConfigModule],

  providers: [
    QwenService,
    ClassificationService,
    AccountMappingService,
    JournalEntryService,
    PaymentService,
  ],
  exports: [
    QwenService,
    ClassificationService,
    AccountMappingService,
    JournalEntryService,
    PaymentService,
  ],
})
export class AiModule {}
