import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { IngestSourceDto } from './dto/ingest-source.dto';
import { UpsertEmbeddingsDto } from './dto/upsert-embeddings.dto';
import { EmbeddingsService } from './embeddings.service';

@Controller('tenants/:orgSlug/embeddings')
export class EmbeddingsController {
  constructor(private readonly embeddingsService: EmbeddingsService) {}

  @Post('upsert')
  upsert(@Param('orgSlug') orgSlug: string, @Body() dto: UpsertEmbeddingsDto) {
    return this.embeddingsService.embedAndStore(orgSlug, dto);
  }

  @Post('ingest')
  ingest(@Param('orgSlug') orgSlug: string, @Body() dto: IngestSourceDto) {
    return this.embeddingsService.ingestSource(orgSlug, dto);
  }

  @Delete(':sourceType/:sourceId')
  softDelete(
    @Param('orgSlug') orgSlug: string,
    @Param('sourceType') sourceType: string,
    @Param('sourceId') sourceId: string,
  ) {
    return this.embeddingsService.softDeleteSource(orgSlug, sourceType, sourceId);
  }
}
