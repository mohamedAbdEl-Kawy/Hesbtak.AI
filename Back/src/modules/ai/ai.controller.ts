import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser, JwtUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantService } from '../tenant/tenant.service';
import { ChatbotService } from './chatbot.service';
import { IngestSourceDto } from './embeddings/dto/ingest-source.dto';
import { UpsertEmbeddingsDto } from './embeddings/dto/upsert-embeddings.dto';
import { EmbeddingsService } from './embeddings/embeddings.service';
import { RunGraphDto } from './langgraph/dto/run-graph.dto';
import { RagIndexService } from './rag-index.service';
import { RetrieveDto } from './retrieval/dto/retrieve.dto';
import { RetrievalService } from './retrieval/retrieval.service';
import { ReportAttachmentService } from './report-attachment.service';

class ChatRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  userQuery?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  question?: string;

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

@UseGuards(JwtAuthGuard)
@Controller('tenant')
export class AiController {
  constructor(
    private readonly tenant: TenantService,
    private readonly chatbot: ChatbotService,
    private readonly embeddings: EmbeddingsService,
    private readonly retrieval: RetrievalService,
    private readonly indexer: RagIndexService,
    private readonly reports: ReportAttachmentService,
  ) {}

  @Post('chatbot')
  async chat(
    @Headers('x-tenant-id') orgId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: ChatRequestDto,
  ) {
    const userQuery = dto.userQuery ?? dto.question;
    if (!userQuery?.trim()) {
      throw new BadRequestException('question or userQuery is required');
    }
    return this.chatbot.run(
      await this.tenant.fromOrganizationId(orgId, user.sub),
      user.sub,
      {
        ...dto,
        userQuery,
      },
    );
  }

  @Post('chatbot/run')
  async runGraph(
    @Headers('x-tenant-id') orgId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: RunGraphDto,
  ) {
    return this.chatbot.run(
      await this.tenant.fromOrganizationId(orgId, user.sub),
      user.sub,
      dto,
    );
  }

  @Get('chatbot/history')
  async history(
    @Headers('x-tenant-id') orgId: string,
    @CurrentUser() user: JwtUser,
    @Query('sessionId') sessionId?: string,
  ) {
    return this.chatbot.history(
      await this.tenant.fromOrganizationId(orgId, user.sub),
      user.sub,
      sessionId,
    );
  }

  @Get('chatbot/reports/:id.pdf')
  async reportPdf(
    @Headers('x-tenant-id') orgId: string,
    @CurrentUser() user: JwtUser,
    @Param('id') reportId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const report = await this.reports.pdf(
      await this.tenant.fromOrganizationId(orgId, user.sub),
      user.sub,
      reportId,
    );
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${report.fileName}"`,
    );
    return new StreamableFile(report.buffer);
  }

  @Post('embeddings/ingest')
  async ingest(
    @Headers('x-tenant-id') orgId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: IngestSourceDto,
  ) {
    const ctx = await this.tenant.fromOrganizationId(orgId, user.sub, [
      'owner',
      'accountant',
    ]);
    return this.embeddings.ingestSource(ctx, dto);
  }

  @Post('embeddings/upsert')
  async upsert(
    @Headers('x-tenant-id') orgId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpsertEmbeddingsDto,
  ) {
    const ctx = await this.tenant.fromOrganizationId(orgId, user.sub, [
      'owner',
      'accountant',
    ]);
    return this.embeddings.embedAndStore(ctx, dto);
  }

  @Delete('embeddings/:sourceType/:sourceId')
  async softDelete(
    @Headers('x-tenant-id') orgId: string,
    @CurrentUser() user: JwtUser,
    @Param('sourceType') sourceType: string,
    @Param('sourceId') sourceId: string,
  ) {
    const ctx = await this.tenant.fromOrganizationId(orgId, user.sub, [
      'owner',
      'accountant',
    ]);
    return this.embeddings.softDeleteSource(
      ctx,
      sourceType,
      sourceId,
    );
  }

  @Post('retrieval')
  async retrieve(
    @Headers('x-tenant-id') orgId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: RetrieveDto,
  ) {
    const ctx = await this.tenant.fromOrganizationId(orgId, user.sub);
    return this.retrieval.retrieve(
      ctx,
      dto.query,
      dto.k,
      dto.similarityThreshold,
    );
  }

  @Get('rag/status')
  async status(
    @Headers('x-tenant-id') orgId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.indexer.status(
      await this.tenant.fromOrganizationId(orgId, user.sub),
    );
  }

  @Post('rag/reindex')
  async reindex(
    @Headers('x-tenant-id') orgId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.indexer.reindexTenant(
      await this.tenant.fromOrganizationId(orgId, user.sub, [
        'owner',
        'accountant',
      ]),
    );
  }
}
