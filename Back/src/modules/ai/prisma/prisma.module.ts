import { Module } from '@nestjs/common';
import { DataBaseModule } from '../../../database/database.module';

@Module({
  imports: [DataBaseModule],
  exports: [DataBaseModule],
})
export class PrismaModule {}
