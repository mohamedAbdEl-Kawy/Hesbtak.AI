import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import PDFDocument from 'pdfkit';
import { DataBaseService } from '../../database/database.service';
import { TenantContext, TenantService } from '../tenant/tenant.service';

@Injectable()
export class ReportAttachmentService {
  constructor(
    private readonly db: DataBaseService,
    private readonly tenant: TenantService,
  ) {}

  async save(
    ctx: TenantContext,
    userId: string,
    sessionId: string,
    markdown: string,
  ) {
    await this.ensureStore(ctx);
    const schema = this.tenant.quote(ctx.schemaName);
    const id = randomUUID();
    const title =
      markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? 'Financial Report';
    await this.db.$executeRawUnsafe(
      `INSERT INTO ${schema}.ai_reports
       (id, session_id, user_id, title, markdown)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5)`,
      id,
      sessionId,
      userId,
      title,
      markdown,
    );
    return {
      id,
      title,
      fileName: `${this.slug(title)}.pdf`,
      contentType: 'application/pdf',
      url: `/tenant/chatbot/reports/${id}.pdf`,
    };
  }

  async pdf(ctx: TenantContext, userId: string, reportId: string) {
    await this.ensureStore(ctx);
    const schema = this.tenant.quote(ctx.schemaName);
    const rows = await this.db.$queryRawUnsafe<
      { title: string; markdown: string }[]
    >(
      `SELECT title, markdown FROM ${schema}.ai_reports
       WHERE id = $1::uuid AND user_id = $2::uuid`,
      reportId,
      userId,
    );
    if (!rows[0]) throw new NotFoundException('Report not found');
    return {
      fileName: `${this.slug(rows[0].title)}.pdf`,
      buffer: await this.render(rows[0].markdown),
    };
  }

  private async ensureStore(ctx: TenantContext) {
    const schema = this.tenant.quote(ctx.schemaName);
    await this.db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ${schema}.ai_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL,
        user_id UUID NOT NULL REFERENCES public.users(id),
        title TEXT NOT NULL,
        markdown TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS ai_reports_user_session_idx
        ON ${schema}.ai_reports (user_id, session_id, created_at);
    `);
  }

  private render(markdown: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({
        size: 'A4',
        margin: 48,
        info: { Title: markdown.match(/^#\s+(.+)$/m)?.[1] ?? 'Financial Report' },
      });
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);

      for (const rawLine of markdown.split(/\r?\n/)) {
        const line = rawLine.trimEnd();
        if (!line) {
          document.moveDown(0.5);
        } else if (line.startsWith('# ')) {
          document.font('Helvetica-Bold').fontSize(20).text(line.slice(2));
          document.moveDown(0.5);
        } else if (line.startsWith('## ')) {
          document.font('Helvetica-Bold').fontSize(14).text(line.slice(3));
          document.moveDown(0.25);
        } else if (line.startsWith('### ')) {
          document.font('Helvetica-Bold').fontSize(12).text(line.slice(4));
        } else if (line.startsWith('- ')) {
          document
            .font('Helvetica')
            .fontSize(10)
            .text(`• ${this.plain(line.slice(2))}`, { indent: 12 });
        } else if (line.startsWith('|')) {
          document
            .font('Courier')
            .fontSize(8)
            .text(this.plain(line), { lineGap: 2 });
        } else if (line === '---') {
          document
            .moveDown(0.25)
            .strokeColor('#999999')
            .moveTo(document.x, document.y)
            .lineTo(document.page.width - 48, document.y)
            .stroke()
            .moveDown(0.5);
        } else {
          document
            .font('Helvetica')
            .fontSize(10)
            .fillColor('#111111')
            .text(this.plain(line), { lineGap: 3 });
        }
      }
      document.end();
    });
  }

  private plain(value: string) {
    return value
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`(.*?)`/g, '$1');
  }

  private slug(value: string) {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'financial-report'
    );
  }
}
