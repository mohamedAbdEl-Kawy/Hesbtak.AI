import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[a-z0-9][a-z0-9_-]*[a-z0-9]$/)
  orgSlug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  plan?: string;
}
