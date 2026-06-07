import { BadRequestException, Injectable } from '@nestjs/common';
import { DataBaseService } from '../../database/database.service';
import { TenantContext, TenantService } from '../tenant/tenant.service';
import {
  AccountDto,
  AttachInvoiceDto,
  ExpenseDto,
  InvoiceDto,
  JournalEntryDto,
  JournalLineDto,
  PartyDto,
  PaymentDto,
  VendorBillDto,
} from './dto';
import { RagIndexService } from '../ai/rag-index.service';

export interface IdRow {
  id: string;
}

export interface TotalRow {
  total: string;
}

@Injectable()
export class AccountingService {
  constructor(
    private readonly db: DataBaseService,
    private readonly tenant: TenantService,
    private readonly ragIndex: RagIndexService,
  ) {}

  async listAccounts(ctx: TenantContext) {
    const schema = this.tenant.quote(ctx.schemaName);
    return this.db.$queryRawUnsafe(
      `SELECT * FROM ${schema}.accounts ORDER BY code ASC`,
    );
  }

  async upsertAccount(ctx: TenantContext, dto: AccountDto) {
    const schema = this.tenant.quote(ctx.schemaName);
    const rows = await this.db.$queryRawUnsafe<IdRow[]>(
      `INSERT INTO ${schema}.accounts (code, name, type, parent_id, level)
       VALUES ($1, $2, $3, $4::uuid, COALESCE((SELECT level + 1 FROM ${schema}.accounts WHERE id = $4::uuid), 1))
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, parent_id = EXCLUDED.parent_id
       RETURNING id`,
      dto.code,
      dto.name,
      dto.type,
      dto.parentId ?? null,
    );
    await this.ragIndex.indexSource(ctx, 'account', rows[0].id);
    return rows[0];
  }

  async createCustomer(ctx: TenantContext, userId: string, dto: PartyDto) {
    return this.insertParty(ctx, userId, 'customers', dto);
  }

  async createVendor(ctx: TenantContext, userId: string, dto: PartyDto) {
    return this.insertParty(ctx, userId, 'vendors', dto);
  }

  async listCustomers(ctx: TenantContext) {
    return this.listTable(ctx, 'customers');
  }

  async listVendors(ctx: TenantContext) {
    return this.listTable(ctx, 'vendors');
  }

  async createJournalEntry(
    ctx: TenantContext,
    userId: string,
    dto: JournalEntryDto,
    referenceType?: string,
    referenceId?: string,
  ): Promise<IdRow> {
    this.ensureBalanced(dto.lines);
    const schema = this.tenant.quote(ctx.schemaName);
    const entries = await this.db.$queryRawUnsafe<IdRow[]>(
      `INSERT INTO ${schema}.journal_entries (date, description, reference_type, reference_id, created_by)
       VALUES ($1::date, $2, $3, $4::uuid, $5::uuid)
       RETURNING id`,
      dto.date,
      dto.description,
      referenceType ?? null,
      referenceId ?? null,
      userId,
    );
    for (const line of dto.lines) {
      await this.db.$executeRawUnsafe(
        `INSERT INTO ${schema}.journal_lines (journal_entry_id, account_id, debit, credit, description)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5)`,
        entries[0].id,
        line.accountId,
        line.debit ?? 0,
        line.credit ?? 0,
        line.description ?? null,
      );
    }
    await this.ragIndex.indexSource(ctx, 'journal_entry', entries[0].id);
    return entries[0];
  }

  async listJournalEntries(ctx: TenantContext) {
    const schema = this.tenant.quote(ctx.schemaName);
    return this.db.$queryRawUnsafe(
      `SELECT je.*, COALESCE(json_agg(jl.*) FILTER (WHERE jl.id IS NOT NULL), '[]') AS lines
       FROM ${schema}.journal_entries je
       LEFT JOIN ${schema}.journal_lines jl ON jl.journal_entry_id = je.id
       GROUP BY je.id
       ORDER BY je.date DESC, je.created_at DESC`,
    );
  }

  async attachInvoiceToJournalEntry(
    ctx: TenantContext,
    userId: string,
    journalEntryId: string,
    dto: AttachInvoiceDto,
  ) {
    const invoice = await this.createInvoice(ctx, userId, dto, journalEntryId);
    await this.createCustomerPayment(ctx, userId, {
      entityId: invoice.id,
      amount: Number(invoice.total),
      paymentMethod: 'cash',
      paymentDate: dto.issueDate,
      notes: 'Auto-created cash sale payment from attached invoice',
    });
    return invoice;
  }

  async createInvoice(
    ctx: TenantContext,
    userId: string,
    dto: InvoiceDto,
    existingJournalEntryId?: string,
  ) {
    const schema = this.tenant.quote(ctx.schemaName);
    const totals = this.calculateLines(dto.lines);
    const number = await this.nextNumber(ctx, 'invoices', 'INV');
    const invoiceRows = await this.db.$queryRawUnsafe<
      (IdRow & { total: string })[]
    >(
      `INSERT INTO ${schema}.invoices
       (invoice_number, customer_id, issue_date, due_date, subtotal, tax_amount, total, status, journal_entry_id, created_by)
       VALUES ($1, $2::uuid, $3::date, $4::date, $5, $6, $7, 'unpaid', $8::uuid, $9::uuid)
       RETURNING id, total`,
      number,
      dto.customerId,
      dto.issueDate,
      dto.dueDate,
      totals.subtotal,
      totals.taxAmount,
      totals.total,
      existingJournalEntryId ?? null,
      userId,
    );
    const invoice = invoiceRows[0];
    let lineNumber = 1;
    for (const line of totals.lines) {
      await this.db.$executeRawUnsafe(
        `INSERT INTO ${schema}.invoice_lines
         (invoice_id, line_number, description, quantity, unit_price, discount_amount, tax_rate, line_subtotal, tax_amount, line_total, revenue_account_id)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::uuid)`,
        invoice.id,
        lineNumber++,
        line.description,
        line.quantity,
        line.unitPrice,
        line.discountAmount,
        line.taxRate,
        line.lineSubtotal,
        line.taxAmount,
        line.lineTotal,
        line.accountId ?? (await this.accountId(ctx, '4000')),
      );
    }

    if (!existingJournalEntryId) {
      const ar = await this.accountId(ctx, '1100');
      const revenue = dto.lines[0]?.accountId ?? (await this.accountId(ctx, '4000'));
      const je = await this.createJournalEntry(
        ctx,
        userId,
        {
          date: dto.issueDate,
          description: `Customer invoice ${number}`,
          lines: [
            { accountId: ar, debit: totals.total, credit: 0 },
            { accountId: revenue, debit: 0, credit: totals.total },
          ],
        },
        'invoice',
        invoice.id,
      );
      await this.db.$executeRawUnsafe(
        `UPDATE ${schema}.invoices SET journal_entry_id = $1::uuid WHERE id = $2::uuid`,
        je.id,
        invoice.id,
      );
    }

    await this.createAlert(ctx, 'due_date', 'info', 'Invoice due date scheduled', `Invoice ${number} is due on ${dto.dueDate}`, 'invoice', invoice.id);
    await this.ragIndex.indexSource(ctx, 'invoice_transaction', invoice.id);
    return { id: invoice.id, invoiceNumber: number, total: invoice.total, status: 'unpaid' };
  }

  async createCustomerPayment(ctx: TenantContext, userId: string, dto: PaymentDto) {
    const schema = this.tenant.quote(ctx.schemaName);
    const invoiceRows = await this.db.$queryRawUnsafe<
      { id: string; customer_id: string; total: string }[]
    >(`SELECT id, customer_id, total FROM ${schema}.invoices WHERE id = $1::uuid`, dto.entityId);
    if (!invoiceRows[0]) throw new BadRequestException('Invoice not found');
    const cash = dto.bankAccountId
      ? await this.bankGlAccount(ctx, dto.bankAccountId)
      : await this.accountId(ctx, '1000');
    const ar = await this.accountId(ctx, '1100');
    const je = await this.createJournalEntry(ctx, userId, {
      date: dto.paymentDate,
      description: `Customer payment for invoice ${dto.entityId}`,
      lines: [
        { accountId: cash, debit: dto.amount, credit: 0 },
        { accountId: ar, debit: 0, credit: dto.amount },
      ],
    }, 'customer_payment');
    const rows = await this.db.$queryRawUnsafe<IdRow[]>(
      `INSERT INTO ${schema}.customer_payments
       (customer_id, invoice_id, amount, payment_method, bank_account_id, payment_date, reference, journal_entry_id, notes, created_by)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6::date, $7, $8::uuid, $9, $10::uuid)
       RETURNING id`,
      invoiceRows[0].customer_id,
      dto.entityId,
      dto.amount,
      dto.paymentMethod,
      dto.bankAccountId ?? null,
      dto.paymentDate,
      dto.reference ?? null,
      je.id,
      dto.notes ?? null,
      userId,
    );
    await this.updateInvoiceStatus(ctx, dto.entityId);
    await this.ragIndex.indexSource(ctx, 'customer_payment', rows[0].id);
    await this.ragIndex.indexSource(ctx, 'invoice_transaction', dto.entityId);
    return rows[0];
  }

  async createVendorBill(ctx: TenantContext, userId: string, dto: VendorBillDto) {
    const schema = this.tenant.quote(ctx.schemaName);
    const totals = this.calculateLines(dto.lines);
    const number = await this.nextNumber(ctx, 'vendor_bills', 'BILL');
    const billRows = await this.db.$queryRawUnsafe<(IdRow & { total: string })[]>(
      `INSERT INTO ${schema}.vendor_bills
       (bill_number, vendor_id, issue_date, due_date, subtotal, tax_amount, total, created_by)
       VALUES ($1, $2::uuid, $3::date, $4::date, $5, $6, $7, $8::uuid)
       RETURNING id, total`,
      number,
      dto.vendorId,
      dto.issueDate,
      dto.dueDate,
      totals.subtotal,
      totals.taxAmount,
      totals.total,
      userId,
    );
    const bill = billRows[0];
    let lineNumber = 1;
    for (const line of totals.lines) {
      await this.db.$executeRawUnsafe(
        `INSERT INTO ${schema}.vendor_bill_lines
         (vendor_bill_id, line_number, description, quantity, unit_cost, discount_amount, tax_rate, line_subtotal, tax_amount, line_total, expense_account_id)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::uuid)`,
        bill.id,
        lineNumber++,
        line.description,
        line.quantity,
        line.unitPrice,
        line.discountAmount,
        line.taxRate,
        line.lineSubtotal,
        line.taxAmount,
        line.lineTotal,
        line.accountId ?? (await this.accountId(ctx, '5000')),
      );
    }
    const expense = dto.lines[0]?.accountId ?? (await this.accountId(ctx, '5000'));
    const ap = await this.accountId(ctx, '2000');
    const je = await this.createJournalEntry(ctx, userId, {
      date: dto.issueDate,
      description: `Vendor bill ${number}`,
      lines: [
        { accountId: expense, debit: totals.total, credit: 0 },
        { accountId: ap, debit: 0, credit: totals.total },
      ],
    }, 'vendor_bill', bill.id);
    await this.db.$executeRawUnsafe(
      `UPDATE ${schema}.vendor_bills SET journal_entry_id = $1::uuid WHERE id = $2::uuid`,
      je.id,
      bill.id,
    );
    await this.createAlert(ctx, 'due_date', 'info', 'Vendor bill due date scheduled', `Bill ${number} is due on ${dto.dueDate}`, 'vendor_bill', bill.id);
    await this.ragIndex.indexSource(ctx, 'vendor_bill_transaction', bill.id);
    return { id: bill.id, billNumber: number, total: bill.total, status: 'received' };
  }

  async createVendorPayment(ctx: TenantContext, userId: string, dto: PaymentDto) {
    const schema = this.tenant.quote(ctx.schemaName);
    const billRows = await this.db.$queryRawUnsafe<
      { id: string; vendor_id: string; total: string }[]
    >(`SELECT id, vendor_id, total FROM ${schema}.vendor_bills WHERE id = $1::uuid`, dto.entityId);
    if (!billRows[0]) throw new BadRequestException('Vendor bill not found');
    const cash = dto.bankAccountId
      ? await this.bankGlAccount(ctx, dto.bankAccountId)
      : await this.accountId(ctx, '1000');
    const ap = await this.accountId(ctx, '2000');
    const je = await this.createJournalEntry(ctx, userId, {
      date: dto.paymentDate,
      description: `Vendor payment for bill ${dto.entityId}`,
      lines: [
        { accountId: ap, debit: dto.amount, credit: 0 },
        { accountId: cash, debit: 0, credit: dto.amount },
      ],
    }, 'vendor_payment');
    const rows = await this.db.$queryRawUnsafe<IdRow[]>(
      `INSERT INTO ${schema}.vendor_payments
       (vendor_bill_id, vendor_id, amount, payment_method, bank_account_id, payment_date, reference, journal_entry_id, notes, created_by)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6::date, $7, $8::uuid, $9, $10::uuid)
       RETURNING id`,
      dto.entityId,
      billRows[0].vendor_id,
      dto.amount,
      dto.paymentMethod,
      dto.bankAccountId ?? null,
      dto.paymentDate,
      dto.reference ?? null,
      je.id,
      dto.notes ?? null,
      userId,
    );
    await this.updateBillStatus(ctx, dto.entityId);
    await this.ragIndex.indexSource(ctx, 'vendor_payment', rows[0].id);
    await this.ragIndex.indexSource(ctx, 'vendor_bill_transaction', dto.entityId);
    return rows[0];
  }

  async listInvoices(ctx: TenantContext) {
    return this.listTable(ctx, 'invoices');
  }

  async listVendorBills(ctx: TenantContext) {
    return this.listTable(ctx, 'vendor_bills');
  }

  async listExpenses(ctx: TenantContext) {
    return this.listTable(ctx, 'expenses');
  }

  async createExpense(ctx: TenantContext, userId: string, dto: ExpenseDto) {
    const schema = this.tenant.quote(ctx.schemaName);
    const number = await this.nextNumber(ctx, 'expenses', 'EXP');
    const taxAmount = Number(dto.taxAmount ?? 0);
    const total = Number(dto.amount) + taxAmount;
    const expenseAccountId = dto.expenseAccountId ?? (await this.accountId(ctx, '5000'));
    const cash = dto.bankAccountId
      ? await this.bankGlAccount(ctx, dto.bankAccountId)
      : await this.accountId(ctx, '1000');

    const je = await this.createJournalEntry(
      ctx,
      userId,
      {
        date: dto.expenseDate,
        description: dto.description,
        lines: [
          { accountId: expenseAccountId, debit: total, credit: 0 },
          { accountId: cash, debit: 0, credit: total },
        ],
      },
      'expense',
    );

    const rows = await this.db.$queryRawUnsafe<IdRow[]>(
      `INSERT INTO ${schema}.expenses
       (expense_number, expense_date, category, description, vendor_id, amount, tax_amount, total, expense_account_id, payment_method, bank_account_id, journal_entry_id, attachment_url, created_by)
       VALUES ($1, $2::date, $3, $4, $5::uuid, $6, $7, $8, $9::uuid, $10, $11::uuid, $12::uuid, $13, $14::uuid)
       RETURNING id`,
      number,
      dto.expenseDate,
      dto.category ?? null,
      dto.description,
      dto.vendorId ?? null,
      dto.amount,
      taxAmount,
      total,
      expenseAccountId,
      dto.paymentMethod,
      dto.bankAccountId ?? null,
      je.id,
      dto.attachmentUrl ?? null,
      userId,
    );
    await this.ragIndex.indexSource(ctx, 'expense', rows[0].id);
    return { id: rows[0].id, expenseNumber: number, total, status: 'completed' };
  }

  async createAlert(ctx: TenantContext, type: string, severity: string, title: string, message: string, entityType?: string, entityId?: string) {
    const schema = this.tenant.quote(ctx.schemaName);
    await this.db.$executeRawUnsafe(
      `INSERT INTO ${schema}.alerts (type, severity, title, message, entity_type, entity_id)
       VALUES ($1, $2, $3, $4, $5, $6::uuid)`,
      type,
      severity,
      title,
      message,
      entityType ?? null,
      entityId ?? null,
    );
  }

  private async insertParty(ctx: TenantContext, userId: string, table: 'customers' | 'vendors', dto: PartyDto) {
    const schema = this.tenant.quote(ctx.schemaName);
    const rows = await this.db.$queryRawUnsafe<IdRow[]>(
      `INSERT INTO ${schema}.${table} (name, email, phone, address, created_by)
       VALUES ($1, $2, $3, $4, $5::uuid)
       RETURNING id`,
      dto.name,
      dto.email ?? null,
      dto.phone ?? null,
      dto.address ?? null,
      userId,
    );
    await this.ragIndex.indexSource(
      ctx,
      table === 'customers' ? 'customer' : 'vendor',
      rows[0].id,
    );
    return rows[0];
  }

  private async listTable(ctx: TenantContext, table: string) {
    const schema = this.tenant.quote(ctx.schemaName);
    return this.db.$queryRawUnsafe(`SELECT * FROM ${schema}.${table} ORDER BY created_at DESC`);
  }

  private ensureBalanced(lines: JournalLineDto[]) {
    const debit = lines.reduce((sum, line) => sum + Number(line.debit ?? 0), 0);
    const credit = lines.reduce((sum, line) => sum + Number(line.credit ?? 0), 0);
    if (!lines.length || Math.abs(debit - credit) > 0.001) {
      throw new BadRequestException('Journal entry lines must balance');
    }
  }

  private calculateLines(lines: { description: string; quantity: number; unitPrice: number; discountAmount?: number; taxRate?: number; accountId?: string }[]) {
    const calculated = lines.map((line) => {
      const quantity = Number(line.quantity ?? 1);
      const unitPrice = Number(line.unitPrice);
      const discountAmount = Number(line.discountAmount ?? 0);
      const taxRate = Number(line.taxRate ?? 0);
      const lineSubtotal = quantity * unitPrice - discountAmount;
      const taxAmount = lineSubtotal * (taxRate / 100);
      return { ...line, quantity, unitPrice, discountAmount, taxRate, lineSubtotal, taxAmount, lineTotal: lineSubtotal + taxAmount };
    });
    return {
      lines: calculated,
      subtotal: calculated.reduce((sum, line) => sum + line.lineSubtotal, 0),
      taxAmount: calculated.reduce((sum, line) => sum + line.taxAmount, 0),
      total: calculated.reduce((sum, line) => sum + line.lineTotal, 0),
    };
  }

  private async accountId(ctx: TenantContext, code: string): Promise<string> {
    const schema = this.tenant.quote(ctx.schemaName);
    const rows = await this.db.$queryRawUnsafe<IdRow[]>(
      `SELECT id FROM ${schema}.accounts WHERE code = $1`,
      code,
    );
    if (!rows[0]) throw new BadRequestException(`Account ${code} not found`);
    return rows[0].id;
  }

  private async bankGlAccount(ctx: TenantContext, bankAccountId: string): Promise<string> {
    const schema = this.tenant.quote(ctx.schemaName);
    const rows = await this.db.$queryRawUnsafe<{ gl_account_id: string }[]>(
      `SELECT gl_account_id FROM ${schema}.bank_accounts WHERE id = $1::uuid`,
      bankAccountId,
    );
    if (!rows[0]) throw new BadRequestException('Bank account not found');
    return rows[0].gl_account_id;
  }

  private async nextNumber(ctx: TenantContext, table: string, prefix: string): Promise<string> {
    const schema = this.tenant.quote(ctx.schemaName);
    const rows = await this.db.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM ${schema}.${table}`,
    );
    return `${prefix}-${String(Number(rows[0].count) + 1).padStart(5, '0')}`;
  }

  private async updateInvoiceStatus(ctx: TenantContext, invoiceId: string) {
    const schema = this.tenant.quote(ctx.schemaName);
    const rows = await this.db.$queryRawUnsafe<TotalRow[]>(
      `SELECT i.total - COALESCE(SUM(cp.amount), 0) AS total
       FROM ${schema}.invoices i
       LEFT JOIN ${schema}.customer_payments cp ON cp.invoice_id = i.id
       WHERE i.id = $1::uuid
       GROUP BY i.id`,
      invoiceId,
    );
    const remaining = Number(rows[0]?.total ?? 0);
    await this.db.$executeRawUnsafe(
      `UPDATE ${schema}.invoices SET status = $1 WHERE id = $2::uuid`,
      remaining <= 0 ? 'paid' : 'partial',
      invoiceId,
    );
  }

  private async updateBillStatus(ctx: TenantContext, billId: string) {
    const schema = this.tenant.quote(ctx.schemaName);
    const rows = await this.db.$queryRawUnsafe<TotalRow[]>(
      `SELECT b.total - COALESCE(SUM(vp.amount), 0) AS total
       FROM ${schema}.vendor_bills b
       LEFT JOIN ${schema}.vendor_payments vp ON vp.vendor_bill_id = b.id
       WHERE b.id = $1::uuid
       GROUP BY b.id`,
      billId,
    );
    const remaining = Number(rows[0]?.total ?? 0);
    await this.db.$executeRawUnsafe(
      `UPDATE ${schema}.vendor_bills SET status = $1 WHERE id = $2::uuid`,
      remaining <= 0 ? 'paid' : 'partial',
      billId,
    );
  }
}
