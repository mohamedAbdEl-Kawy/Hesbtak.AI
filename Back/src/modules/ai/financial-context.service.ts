import { Injectable } from '@nestjs/common';
import { DataBaseService } from '../../database/database.service';
import { TenantContext, TenantService } from '../tenant/tenant.service';

@Injectable()
export class FinancialContextService {
  constructor(
    private readonly db: DataBaseService,
    private readonly tenant: TenantService,
  ) {}

  async build(ctx: TenantContext) {
    const schema = this.tenant.quote(ctx.schemaName);
    const organization = await this.db.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      select: { name: true, industry: true, currency: true },
    });
    const [ledger, documents, monthly, expenses] = await Promise.all([
      this.db.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT
          COALESCE(SUM(CASE WHEN a.type = 'Revenue' THEN jl.credit - jl.debit ELSE 0 END), 0) AS revenue,
          COALESCE(SUM(CASE WHEN a.type = 'Expense' THEN jl.debit - jl.credit ELSE 0 END), 0) AS expenses,
          COALESCE(SUM(CASE WHEN a.code = '1000' THEN jl.debit - jl.credit ELSE 0 END), 0) AS cash
         FROM ${schema}.accounts a
         LEFT JOIN ${schema}.journal_lines jl ON jl.account_id = a.id`,
      ),
      this.db.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT
          (SELECT COALESCE(SUM(total), 0) FROM ${schema}.invoices
           WHERE status IN ('unpaid','partial')) AS accounts_receivable,
          (SELECT COALESCE(SUM(total), 0) FROM ${schema}.vendor_bills
           WHERE status IN ('received','partial')) AS accounts_payable,
          (SELECT COUNT(*) FROM ${schema}.invoices) AS invoice_count,
          (SELECT COUNT(*) FROM ${schema}.vendor_bills) AS vendor_bill_count`,
      ),
      this.db.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT month, SUM(revenue) AS revenue, SUM(expenses) AS expenses
         FROM (
           SELECT date_trunc('month', issue_date)::date AS month,
             SUM(total) AS revenue, 0::numeric AS expenses
           FROM ${schema}.invoices GROUP BY 1
           UNION ALL
           SELECT date_trunc('month', expense_date)::date AS month,
             0::numeric AS revenue, SUM(total) AS expenses
           FROM ${schema}.expenses GROUP BY 1
         ) monthly
         GROUP BY month ORDER BY month DESC LIMIT 12`,
      ),
      this.db.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT COALESCE(category, 'Uncategorized') AS category,
          SUM(total) AS total
         FROM ${schema}.expenses
         GROUP BY category ORDER BY total DESC LIMIT 10`,
      ),
    ]);

    return {
      organization,
      generatedAt: new Date().toISOString(),
      ledger: ledger[0] ?? {},
      documents: documents[0] ?? {},
      monthly,
      topExpenseCategories: expenses,
    };
  }
}
