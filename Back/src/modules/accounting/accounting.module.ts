import { Module } from '@nestjs/common';
import { DataBaseModule } from '../../database/database.module';
import { TenantModule } from '../tenant/tenant.module';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [DataBaseModule, TenantModule, AiModule],
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}
