import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class RunGraphDto {
  @IsString()
  @MaxLength(4000)
  userQuery!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sessionId?: string;

  @IsOptional()
  @IsObject()
  financialReports?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  regulatoryFilters?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  filePayload?: Record<string, unknown>;
}
