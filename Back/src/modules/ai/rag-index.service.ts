import { Injectable, Logger } from '@nestjs/common';
import { DataBaseService } from '../../database/database.service';
import { TenantContext, TenantService } from '../tenant/tenant.service';
import { SourceType } from './embeddings/dto/ingest-source.dto';
import { EmbeddingsService } from './embeddings/embeddings.service';

@Injectable()
export class RagIndexService {
  private readonly logger = new Logger(RagIndexService.name);

  constructor(
    private readonly db: DataBaseService,
    private readonly tenant: TenantService,
    private readonly embeddings: EmbeddingsService,
  ) {}

  async indexSource(
    ctx: TenantContext,
    sourceType: SourceType,
    sourceId: string,
  ) {
    try {
      const payload = await this.loadPayload(ctx, sourceType, sourceId);
      if (payload) {
        await this.embeddings.ingestSource(ctx, {
          sourceType,
          sourceId,
          payload,
        });
      }
    } catch (error) {
      this.logger.error(
        `RAG indexing failed for ${sourceType}:${sourceId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async reindexTenant(ctx: TenantContext) {
    await this.embeddings.ensureStore(ctx);
    const schema = this.tenant.quote(ctx.schemaName);
    const sources: Array<[SourceType, string]> = [];
    const tables: Array<[SourceType, string]> = [
      ['account', 'accounts'],
      ['customer', 'customers'],
      ['vendor', 'vendors'],
      ['journal_entry', 'journal_entries'],
      ['invoice_transaction', 'invoices'],
      ['customer_payment', 'customer_payments'],
      ['vendor_bill_transaction', 'vendor_bills'],
      ['vendor_payment', 'vendor_payments'],
      ['expense', 'expenses'],
      ['onboarding_questionnaire', 'onboarding_responses'],
    ];
    for (const [sourceType, table] of tables) {
      const rows = await this.db.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM ${schema}.${table}`,
      );
      rows.forEach((row) => sources.push([sourceType, row.id]));
    }
    for (const [sourceType, sourceId] of sources) {
      await this.indexSource(ctx, sourceType, sourceId);
    }
    return { indexed: sources.length, status: await this.status(ctx) };
  }

  async status(ctx: TenantContext) {
    await this.embeddings.ensureStore(ctx);
    const schema = this.tenant.quote(ctx.schemaName);
    const rows = await this.db.$queryRawUnsafe<
      { source_type: string; count: bigint; last_updated: Date }[]
    >(
      `SELECT source_type, COUNT(*)::bigint AS count,
        MAX(updated_at) AS last_updated
       FROM ${schema}.embeddings
       WHERE is_deleted = false
       GROUP BY source_type
       ORDER BY source_type`,
    );
    return rows.map((row) => ({ ...row, count: Number(row.count) }));
  }

  private async loadPayload(
    ctx: TenantContext,
    sourceType: SourceType,
    sourceId: string,
  ): Promise<Record<string, unknown> | null> {
    const schema = this.tenant.quote(ctx.schemaName);
    const queries: Record<SourceType, string> = {
      account: `SELECT jsonb_build_object('code', code, 'name', name, 'type', type, 'is_active', is_active) data FROM ${schema}.accounts WHERE id = $1::uuid`,
      customer: `SELECT jsonb_build_object('name', name, 'email', email, 'phone', phone, 'address', address, 'currency', currency, 'payment_terms', payment_terms) data FROM ${schema}.customers WHERE id = $1::uuid`,
      vendor: `SELECT jsonb_build_object('name', name, 'email', email, 'phone', phone, 'address', address, 'payment_terms', payment_terms) data FROM ${schema}.vendors WHERE id = $1::uuid`,
      journal_entry: `SELECT jsonb_build_object('journal_entry_id', je.id, 'entry_date', je.date, 'entry_type', COALESCE(je.reference_type, 'manual'), 'narration', je.description, 'debit_lines', COALESCE(jsonb_agg(jsonb_build_object('account', a.code || ' ' || a.name, 'amount', jl.debit, 'description', jl.description)) FILTER (WHERE jl.debit > 0), '[]'::jsonb), 'credit_lines', COALESCE(jsonb_agg(jsonb_build_object('account', a.code || ' ' || a.name, 'amount', jl.credit, 'description', jl.description)) FILTER (WHERE jl.credit > 0), '[]'::jsonb), 'gl_accounts', COALESCE(jsonb_agg(DISTINCT a.code) FILTER (WHERE a.id IS NOT NULL), '[]'::jsonb), 'posted_by', je.created_by) data FROM ${schema}.journal_entries je LEFT JOIN ${schema}.journal_lines jl ON jl.journal_entry_id = je.id LEFT JOIN ${schema}.accounts a ON a.id = jl.account_id WHERE je.id = $1::uuid GROUP BY je.id`,
      invoice_transaction: `SELECT jsonb_build_object('invoice_id', i.id, 'invoice_number', i.invoice_number, 'customer_name', c.name, 'payment_terms', c.payment_terms, 'currency', c.currency, 'issue_date', i.issue_date, 'due_date', i.due_date, 'subtotal', i.subtotal, 'tax_amount', i.tax_amount, 'total', i.total, 'status', i.status, 'line_items', COALESCE(jsonb_agg(jsonb_build_object('description', l.description, 'quantity', l.quantity, 'unit_price', l.unit_price, 'line_total', l.line_total)) FILTER (WHERE l.id IS NOT NULL), '[]'::jsonb), 'journal_entry_id', i.journal_entry_id, 'created_by', i.created_by) data FROM ${schema}.invoices i JOIN ${schema}.customers c ON c.id = i.customer_id LEFT JOIN ${schema}.invoice_lines l ON l.invoice_id = i.id WHERE i.id = $1::uuid GROUP BY i.id, c.name, c.payment_terms, c.currency`,
      customer_payment: `SELECT jsonb_build_object('payment_id', p.id, 'payment_reference', p.reference, 'customer_name', c.name, 'invoice_number', i.invoice_number, 'amount', p.amount, 'payment_method', p.payment_method, 'payment_date', p.payment_date, 'journal_entry_id', p.journal_entry_id, 'status', i.status) data FROM ${schema}.customer_payments p JOIN ${schema}.customers c ON c.id = p.customer_id LEFT JOIN ${schema}.invoices i ON i.id = p.invoice_id WHERE p.id = $1::uuid`,
      vendor_bill_transaction: `SELECT jsonb_build_object('vendor_bill_id', b.id, 'bill_number', b.bill_number, 'vendor_name', v.name, 'payment_terms', v.payment_terms, 'issue_date', b.issue_date, 'due_date', b.due_date, 'subtotal', b.subtotal, 'tax_amount', b.tax_amount, 'total', b.total, 'status', b.status, 'line_items', COALESCE(jsonb_agg(jsonb_build_object('description', l.description, 'quantity', l.quantity, 'unit_cost', l.unit_cost, 'line_total', l.line_total)) FILTER (WHERE l.id IS NOT NULL), '[]'::jsonb), 'journal_entry_id', b.journal_entry_id) data FROM ${schema}.vendor_bills b JOIN ${schema}.vendors v ON v.id = b.vendor_id LEFT JOIN ${schema}.vendor_bill_lines l ON l.vendor_bill_id = b.id WHERE b.id = $1::uuid GROUP BY b.id, v.name, v.payment_terms`,
      vendor_payment: `SELECT jsonb_build_object('payment_id', p.id, 'payment_reference', p.reference, 'vendor_name', v.name, 'bill_number', b.bill_number, 'amount', p.amount, 'payment_method', p.payment_method, 'payment_date', p.payment_date, 'journal_entry_id', p.journal_entry_id) data FROM ${schema}.vendor_payments p JOIN ${schema}.vendors v ON v.id = p.vendor_id JOIN ${schema}.vendor_bills b ON b.id = p.vendor_bill_id WHERE p.id = $1::uuid`,
      expense: `SELECT jsonb_build_object('expense_number', e.expense_number, 'expense_date', e.expense_date, 'category', e.category, 'description', e.description, 'vendor_name', v.name, 'amount', e.amount, 'tax_amount', e.tax_amount, 'total', e.total, 'payment_method', e.payment_method, 'journal_entry_id', e.journal_entry_id) data FROM ${schema}.expenses e LEFT JOIN ${schema}.vendors v ON v.id = e.vendor_id WHERE e.id = $1::uuid`,
      onboarding_questionnaire: `SELECT jsonb_build_object('sections', jsonb_build_object(question_key, answer)) data FROM ${schema}.onboarding_responses WHERE id = $1::uuid`,
      anomaly_flag: '',
      anomaly_flagged_transactions: '',
      quarter_live_report: '',
      ai_insights: '',
    };
    const query = queries[sourceType];
    if (!query) return null;
    const rows = await this.db.$queryRawUnsafe<
      { data: Record<string, unknown> }[]
    >(query, sourceId);
    return rows[0]?.data ?? null;
  }
}
