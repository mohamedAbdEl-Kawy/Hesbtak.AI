import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class EmbeddingChunkDto {
  @IsInt()
  @Min(0)
  chunkIndex!: number;

  @IsString()
  @MaxLength(12000)
  text!: string;

  @IsObject()
  metadata!: Record<string, unknown>;
}

export class UpsertEmbeddingsDto {
  @IsString()
  @MaxLength(60)
  sourceType!: string;

  @IsString()
  @MaxLength(120)
  sourceId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => EmbeddingChunkDto)
  chunks!: EmbeddingChunkDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(512)
  maxTokens?: number;
}
