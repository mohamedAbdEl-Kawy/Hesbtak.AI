import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataBaseService } from '../../database/database.service';
import { AccountingService } from '../accounting/accounting.service';
import { TenantContext, TenantService } from '../tenant/tenant.service';
import { RecurringEntryDto } from './dto';

@Injectable()
export class AutomationService {
  constructor(
    private readonly db: DataBaseService,
    private readonly tenant: TenantService,
    private readonly accounting: AccountingService,
  ) {}

  async createRecurringEntry(ctx: TenantContext, userId: string, dto: RecurringEntryDto) {
    const schema = this.tenant.quote(ctx.schemaName);
    const rows = await this.db.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO ${schema}.recurring_entries
       (name, frequency, start_date, end_date, next_run, template, created_by)
       VALUES ($1, $2, $3::date, $4::date, $3::date, $5::jsonb, $6::uuid)
       RETURNING id`,
      dto.name,
      dto.frequency,
      dto.startDate,
      dto.endDate ?? null,
      JSON.stringify({ lines: dto.lines }),
      userId,
    );
    return rows[0];
  }

  async listRecurringEntries(ctx: TenantContext) {
    const schema = this.tenant.quote(ctx.schemaName);
    return this.db.$queryRawUnsafe(`SELECT * FROM ${schema}.recurring_entries ORDER BY created_at DESC`);
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async runRecurringEntriesForAllTenants() {
    const orgs = await this.db.organization.findMany();
    for (const org of orgs) {
      await this.runRecurringEntries({
        organizationId: org.id,
        schemaName: org.schemaName,
        role: 'system',
      });
    }
  }

  async runRecurringEntries(ctx: TenantContext) {
    const schema = this.tenant.quote(ctx.schemaName);
    const entries = await this.db.$queryRawUnsafe<
      { id: string; name: string; frequency: string; next_run: Date; created_by: string; template: { lines: { accountId: string; debit: number; credit: number; description?: string }[] } }[]
    >(
      `SELECT * FROM ${schema}.recurring_entries
       WHERE is_active = true AND next_run <= CURRENT_DATE AND (end_date IS NULL OR end_date >= CURRENT_DATE)`,
    );
    for (const entry of entries) {
      try {
        const je = await this.accounting.createJournalEntry(ctx, entry.created_by, {
          date: new Date().toISOString().slice(0, 10),
          description: `Recurring entry: ${entry.name}`,
          lines: entry.template.lines,
        }, 'recurring_entry', entry.id);
        await this.db.$executeRawUnsafe(
          `INSERT INTO ${schema}.recurring_entry_logs (recurring_entry_id, journal_entry_id, generated_date, status)
           VALUES ($1::uuid, $2::uuid, CURRENT_DATE, 'generated')`,
          entry.id,
          je.id,
        );
        await this.db.$executeRawUnsafe(
          `UPDATE ${schema}.recurring_entries
           SET next_run = CASE frequency
             WHEN 'weekly' THEN next_run + INTERVAL '7 days'
             WHEN 'yearly' THEN next_run + INTERVAL '1 year'
             ELSE next_run + INTERVAL '1 month'
           END
           WHERE id = $1::uuid`,
          entry.id,
        );
      } catch {
        await this.db.$executeRawUnsafe(
          `INSERT INTO ${schema}.recurring_entry_logs (recurring_entry_id, generated_date, status)
           VALUES ($1::uuid, CURRENT_DATE, 'failed')`,
          entry.id,
        );
      }
    }
    return { processed: entries.length };
  }

  async dashboard(ctx: TenantContext) {
    const schema = this.tenant.quote(ctx.schemaName);
    const rows = await this.db.$queryRawUnsafe<
      { account_type: string; balance: string }[]
    >(
      `SELECT a.type AS account_type, COALESCE(SUM(jl.debit - jl.credit), 0) AS balance
       FROM ${schema}.accounts a
       LEFT JOIN ${schema}.journal_lines jl ON jl.account_id = a.id
       GROUP BY a.type`,
    );
    const value = (type: string) => Number(rows.find((r) => r.account_type === type)?.balance ?? 0);
    const ar = await this.sum(ctx, 'invoices', "status IN ('unpaid','partial')");
    const ap = await this.sum(ctx, 'vendor_bills', "status IN ('received','partial')");
    return {
      cash: value('Asset'),
      revenue: -value('Revenue'),
      expenses: value('Expense'),
      netIncome: -value('Revenue') - value('Expense'),
      accountsReceivable: ar,
      accountsPayable: ap,
    };
  }

  async forecast(ctx: TenantContext, months = 12) {
    const dashboard = await this.dashboard(ctx);
    const monthlyRevenue = dashboard.revenue / Math.max(1, months);
    const monthlyExpense = dashboard.expenses / Math.max(1, months);
    const result = Array.from({ length: months }, (_, i) => {
      const date = new Date();
      date.setMonth(date.getMonth() + i + 1, 1);
      const growth = 1 + i * 0.015;
      return {
        forecastMonth: date.toISOString().slice(0, 10),
        predictedRevenue: Number((monthlyRevenue * growth).toFixed(2)),
        predictedExpense: Number((monthlyExpense * (1 + i * 0.01)).toFixed(2)),
        predictedCashflow: Number(((monthlyRevenue - monthlyExpense) * growth).toFixed(2)),
        confidenceLow: Number(((monthlyRevenue - monthlyExpense) * 0.85).toFixed(2)),
        confidenceHigh: Number(((monthlyRevenue - monthlyExpense) * 1.15).toFixed(2)),
      };
    });
    return { modelVersion: 'baseline-v1', months: result };
  }

  async listAlerts(ctx: TenantContext) {
    const schema = this.tenant.quote(ctx.schemaName);
    return this.db.$queryRawUnsafe(`SELECT * FROM ${schema}.alerts ORDER BY created_at DESC`);
  }

  async evaluateAlerts(ctx: TenantContext) {
    const schema = this.tenant.quote(ctx.schemaName);
    await this.db.$executeRawUnsafe(
      `INSERT INTO ${schema}.alerts (type, severity, title, message, entity_type, entity_id)
       SELECT 'due_date', 'warning', 'Invoice due soon', 'Invoice ' || invoice_number || ' is due by ' || due_date, 'invoice', id
       FROM ${schema}.invoices
       WHERE status IN ('unpaid','partial') AND due_date <= CURRENT_DATE + INTERVAL '7 days'
       ON CONFLICT DO NOTHING`,
    );
    return this.listAlerts(ctx);
  }

  async suggestions(ctx: TenantContext) {
    const schema = this.tenant.quote(ctx.schemaName);
    const dashboard = await this.dashboard(ctx);
    if (dashboard.expenses > dashboard.revenue * 0.7 && dashboard.revenue > 0) {
      await this.db.$executeRawUnsafe(
        `INSERT INTO ${schema}.suggestions (type, title, description)
         VALUES ('cost_optimization', 'Review high expense ratio', 'Expenses are above 70% of revenue. Review recurring and discretionary spend.')`,
      );
    }
    return this.db.$queryRawUnsafe(`SELECT * FROM ${schema}.suggestions WHERE status = 'active' ORDER BY created_at DESC`);
  }

  private async sum(ctx: TenantContext, table: string, where: string): Promise<number> {
    const schema = this.tenant.quote(ctx.schemaName);
    const rows = await this.db.$queryRawUnsafe<{ total: string }[]>(
      `SELECT COALESCE(SUM(total), 0) AS total FROM ${schema}.${table} WHERE ${where}`,
    );
    return Number(rows[0]?.total ?? 0);
  }
}
