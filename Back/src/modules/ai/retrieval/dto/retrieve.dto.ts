import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  RAG_SOURCE_TYPES,
  SourceType,
} from '../../embeddings/dto/ingest-source.dto';

export class RetrieveDto {
  @IsString()
  @MaxLength(4000)
  query!: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsIn(RAG_SOURCE_TYPES, { each: true })
  sourceTypes?: SourceType[];

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(20)
  k?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  similarityThreshold?: number;



}
