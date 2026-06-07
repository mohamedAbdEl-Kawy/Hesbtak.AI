import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataBaseService } from '../../database/database.service';
import { TenantContext, TenantService } from '../tenant/tenant.service';
import { LanggraphService } from './langgraph/langgraph.service';
import { RunGraphDto } from './langgraph/dto/run-graph.dto';
import { ReportAttachmentService } from './report-attachment.service';

@Injectable()
export class ChatbotService {
  constructor(
    private readonly db: DataBaseService,
    private readonly tenant: TenantService,
    private readonly langgraph: LanggraphService,
    private readonly reports: ReportAttachmentService,
  ) {}

  async run(
    ctx: TenantContext,
    userId: string,
    dto: RunGraphDto,
  ) {
    const result = await this.langgraph.run(ctx, {
      ...dto,
      userId,
    });
    const sessionId = dto.sessionId ?? randomUUID();
    const response =
      result.finalResponse ??
      result.agentOutput ??
      'The chatbot did not return a response.';
    const schema = this.tenant.quote(ctx.schemaName);
    await this.db.$executeRawUnsafe(
      `INSERT INTO ${schema}.ai_conversations
       (session_id, user_id, question, response)
       VALUES ($1::uuid, $2::uuid, $3, $4)`,
      sessionId,
      userId,
      dto.userQuery,
      response,
    );
    const attachment = result.reportMarkdown
      ? await this.reports.save(
          ctx,
          userId,
          sessionId,
          result.reportMarkdown,
        )
      : null;
    return {
      sessionId,
      response,
      agentResponse: response,
      attachment,
      ...result,
    };
  }

  history(ctx: TenantContext, userId: string, sessionId?: string) {
    const schema = this.tenant.quote(ctx.schemaName);
    return this.db.$queryRawUnsafe(
      `SELECT session_id, question, response, created_at
       FROM ${schema}.ai_conversations
       WHERE user_id = $1::uuid
         AND ($2::uuid IS NULL OR session_id = $2::uuid)
       ORDER BY created_at ASC
       LIMIT 100`,
      userId,
      sessionId ?? null,
    );
  }
}
