import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import type {
  AccountMappingResult,
  ClassificationResult,
  DirectoryAccount,
  DirectoryParty,
  ExtractionResult,
  JournalProposal,
  PaymentProposal,
} from './types';

export class CreateAiWorkflowDto {
  @IsIn(['vendor', 'customer'])
  documentSide!: 'vendor' | 'customer';

  @IsIn(['paid', 'unpaid'])
  paymentStatus!: 'paid' | 'unpaid';
}

export class ConfirmExtractionDto {
  @IsOptional()
  approvedData?: ExtractionResult;
}

export class MappingContextDto {
  @IsArray()
  accounts!: DirectoryAccount[];

  @IsArray()
  customers!: DirectoryParty[];

  @IsArray()
  vendors!: DirectoryParty[];
}

export class ConfirmClassificationDto {
  @IsOptional()
  approvedData?: ClassificationResult;

  @ValidateNested()
  @Type(() => MappingContextDto)
  context!: MappingContextDto;
}

export class ConfirmAccountMappingDto {
  @IsOptional()
  approvedData?: AccountMappingResult;
}

export class ConfirmJournalDto {
  @IsOptional()
  approvedData?: JournalProposal;
}

export class ConfirmPaymentDto {
  @IsOptional()
  approvedData?: PaymentProposal;
}
