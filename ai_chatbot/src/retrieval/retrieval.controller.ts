import { Body, Controller, Param, Post } from '@nestjs/common';
import { RetrieveDto } from './dto/retrieve.dto';
import { RetrievalService } from './retrieval.service';

@Controller('tenants/:orgSlug/retrieval')
export class RetrievalController {
  constructor(private readonly retrievalService: RetrievalService) {}

  @Post()
  retrieve(@Param('orgSlug') orgSlug: string, @Body() dto: RetrieveDto) {
    return this.retrievalService.retrieve(orgSlug, dto.query, dto.k, dto.similarityThreshold);
  }
}
