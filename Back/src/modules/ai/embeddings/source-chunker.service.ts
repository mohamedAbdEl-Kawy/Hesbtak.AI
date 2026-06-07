import { BadRequestException, Injectable } from '@nestjs/common';
import { SourceType } from './dto/ingest-source.dto';
import { EmbeddingChunkDto } from './dto/upsert-embeddings.dto';

type Chunk = Omit<EmbeddingChunkDto, 'chunkIndex'>;

@Injectable()
export class SourceChunkerService {
  build(sourceType: SourceType, payload: Record<string, unknown>): EmbeddingChunkDto[] {
    const chunks = this.buildChunks(sourceType, payload);
    return chunks.map((chunk, chunkIndex) => ({ chunkIndex, ...chunk }));
  }

  private buildChunks(sourceType: SourceType, payload: Record<string, unknown>): Chunk[] {
    switch (sourceType) {
      case 'invoice_transaction':
        return [this.invoiceTransaction(payload)];
      case 'vendor_bill_transaction':
        return [this.vendorBillTransaction(payload)];
      case 'customer_payment':
        return [this.customerPayment(payload)];
      case 'vendor_payment':
        return [this.vendorPayment(payload)];
      case 'journal_entry':
        return [this.journalEntry(payload)];
      case 'anomaly_flag':
      case 'anomaly_flagged_transactions':
        return [this.anomalyFlag(payload)];
      case 'onboarding_questionnaire':
        return this.onboardingQuestionnaire(payload);
      case 'quarter_live_report':
        return this.quarterLiveReport(payload);
      case 'ai_insights':
        return this.aiInsights(payload);
      case 'account':
        return [this.genericRecord('Account', payload)];
      case 'customer':
        return [this.genericRecord('Customer', payload)];
      case 'vendor':
        return [this.genericRecord('Vendor', payload)];
      case 'expense':
        return [this.genericRecord('Expense', payload)];
      default:
        throw new BadRequestException(`Unsupported source type: ${sourceType}`);
    }
  }

  // ─── Existing source type handlers (unchanged) ─────────────────────────────

  private invoiceTransaction(payload: Record<string, unknown>): Chunk {
    const customer = this.value(payload, 'customer_name', undefined, 'unknown customer');
    return {
      text: `Invoice ${this.value(payload, 'invoice_number', 'invoice_id')} issued to customer '${customer}' (industry: ${this.value(payload, 'industry', undefined, 'n/a')}, payment_terms: ${this.value(payload, 'payment_terms', undefined, 'n/a')}) on ${this.value(payload, 'issue_date')}, due ${this.value(payload, 'due_date')}.
Total amount: ${this.money(payload, 'total')} (subtotal: ${this.value(payload, 'subtotal', undefined, 'n/a')}, tax: ${this.value(payload, 'tax', 'tax_amount', '0')}).
Status: ${this.value(payload, 'status')}. Line items: ${this.value(payload, 'line_items', undefined, '[]')}.
GL accounts debited: ${this.value(payload, 'gl_debit_accounts', 'gl_accounts', '[]')}. GL accounts credited: ${this.value(payload, 'gl_credit_accounts', undefined, '[]')}.
Journal Entry ${this.value(payload, 'journal_entry_id', undefined, 'n/a')} | Created by: ${this.value(payload, 'created_by', undefined, 'system')}.`,
      metadata: this.metadata(payload),
    };
  }

  private vendorBillTransaction(payload: Record<string, unknown>): Chunk {
    return {
      text: `Vendor Bill ${this.value(payload, 'bill_number', 'vendor_bill_id')} from vendor '${this.value(payload, 'vendor_name')}' (payment_terms: ${this.value(payload, 'payment_terms', undefined, 'n/a')}) dated ${this.value(payload, 'issue_date')}, due ${this.value(payload, 'due_date')}.
Total amount: ${this.money(payload, 'total')} (subtotal: ${this.value(payload, 'subtotal', undefined, 'n/a')}, tax: ${this.value(payload, 'tax', 'tax_amount', '0')}).
Status: ${this.value(payload, 'status')}${this.optionalSentence(payload, 'payment_date', ' paid on ')}. Payment method: ${this.value(payload, 'payment_method', undefined, 'n/a')}.
Line items: ${this.value(payload, 'line_items', undefined, '[]')}. GL accounts: ${this.value(payload, 'gl_accounts', undefined, '[]')}.
Journal Entries: ${this.value(payload, 'journal_entries', 'journal_entry_id', 'n/a')}.`,
      metadata: this.metadata(payload),
    };
  }

  private customerPayment(payload: Record<string, unknown>): Chunk {
    return {
      text: `Customer payment ${this.value(payload, 'payment_reference', 'payment_id')} received from '${this.value(payload, 'customer_name')}' on ${this.value(payload, 'payment_date')}.
Amount: ${this.money(payload, 'amount')}. Linked invoice: ${this.value(payload, 'invoice_number', 'invoice_id')}.
Bank account: ${this.value(payload, 'bank_account_name', undefined, 'n/a')}. Payment method: ${this.value(payload, 'payment_method', undefined, 'n/a')}.
GL entry: ${this.value(payload, 'journal_entry_id', undefined, 'n/a')}. Payment status impact: ${this.value(payload, 'status', undefined, 'recorded')}.`,
      metadata: this.metadata(payload),
    };
  }

  private vendorPayment(payload: Record<string, unknown>): Chunk {
    return {
      text: `Vendor payment ${this.value(payload, 'payment_reference', 'payment_id')} paid to '${this.value(payload, 'vendor_name')}' on ${this.value(payload, 'payment_date')}.
Amount: ${this.money(payload, 'amount')}. Linked bill: ${this.value(payload, 'bill_number', 'vendor_bill_id')}.
Bank account: ${this.value(payload, 'bank_account_name', undefined, 'n/a')}. Payment method: ${this.value(payload, 'payment_method', undefined, 'n/a')}.
GL entry: ${this.value(payload, 'journal_entry_id', undefined, 'n/a')}.`,
      metadata: this.metadata(payload),
    };
  }

  private journalEntry(payload: Record<string, unknown>): Chunk {
    return {
      text: `Journal Entry ${this.value(payload, 'entry_code', 'journal_entry_id')} on ${this.value(payload, 'entry_date')} (${this.value(payload, 'entry_type', undefined, 'manual')}).
Narration: ${this.value(payload, 'narration')}. Debit lines: ${this.value(payload, 'debit_lines', 'debits', '[]')}.
Credit lines: ${this.value(payload, 'credit_lines', 'credits', '[]')}. GL accounts: ${this.value(payload, 'gl_accounts', undefined, '[]')}.
Posted by: ${this.value(payload, 'posted_by', undefined, 'n/a')}. Reference: ${this.value(payload, 'reference_doc', undefined, 'n/a')}.`,
      metadata: this.metadata(payload),
    };
  }

  private anomalyFlag(payload: Record<string, unknown>): Chunk {
    return {
      text: `Anomaly flag ${this.value(payload, 'anomaly_id', 'source_id', 'n/a')} for ${this.value(payload, 'transaction_type', undefined, 'transaction')} ${this.value(payload, 'transaction_id')}.
Score: ${this.value(payload, 'anomaly_score')}. Feature explanation: ${this.value(payload, 'feature_explanation', 'explanation')}.
Amount: ${this.money(payload, 'amount')}. Counterparty: ${this.value(payload, 'counterparty_name', 'vendor_name', 'n/a')}.
GL accounts: ${this.value(payload, 'gl_accounts', undefined, '[]')}. User confirmation: ${this.value(payload, 'was_user_confirmed', undefined, 'false')}.`,
      metadata: this.metadata(payload),
    };
  }

  // ─── Updated onboarding questionnaire (aligned with public.organizations schema) ──

  /**
   * Onboarding questionnaire aligned with public.organizations schema.
   * Core fields: name (org name), industry, currency.
   * Extended context lives in the freeform `sections` map.
   */
  private onboardingQuestionnaire(payload: Record<string, unknown>): Chunk[] {
    const orgName = this.safeValue(payload, 'org_name', 'name', 'tenant');
    const industry = this.safeValue(payload, 'industry', undefined, 'n/a');
    const currency = this.safeValue(payload, 'currency', undefined, 'n/a');

    const baseContext = `Organization: ${orgName}. Industry: ${industry}. Operating currency: ${currency}.`;

    const sections = this.asRecord(payload.sections);
    if (sections && Object.keys(sections).length > 0) {
      return Object.entries(sections).map(([category, content]) => ({
        text: `${baseContext} Business context — ${this.title(category)}: ${String(content)}`,
        metadata: { ...this.metadata(payload), question_category: category },
      }));
    }

    // Fallback: windowed chunking on a freeform body field
    if (payload.body) {
      return this.windowed(payload, 'body', 300, 40, this.metadata(payload)).map((chunk) => ({
        ...chunk,
        text: `${baseContext} ${chunk.text}`,
      }));
    }

    // Minimal single chunk with just the core org fields
    return [
      {
        text: baseContext,
        metadata: this.metadata(payload),
      },
    ];
  }

  // ─── New: quarter_live_report ───────────────────────────────────────────────

  /**
   * Chunks a quarter live report into focused sections for semantic retrieval.
   *
   * Expected payload fields:
   *  - org_name, quarter (e.g. "Q1 2025"), fiscal_year
   *  - income_statement, balance_sheet, cash_flow_statement (objects or text)
   *  - kpis (object), revenue_trends, expense_trends
   *  - cash_metrics, risk_indicators, operational_metrics
   */
  private quarterLiveReport(payload: Record<string, unknown>): Chunk[] {
    const orgName = this.safeValue(payload, 'org_name', undefined, 'tenant');
    const quarter = this.safeValue(payload, 'quarter', undefined, 'current quarter');
    const fy = this.safeValue(payload, 'fiscal_year', undefined, '');
    const period = `${orgName} | ${quarter}${fy ? ` ${fy}` : ''}`;
    const baseMeta = this.metadata(payload);

    const sections: Array<{ key: string; label: string }> = [
      { key: 'income_statement', label: 'Income Statement' },
      { key: 'balance_sheet', label: 'Balance Sheet' },
      { key: 'cash_flow_statement', label: 'Cash Flow Statement' },
      { key: 'kpis', label: 'Key Performance Indicators' },
      { key: 'revenue_trends', label: 'Revenue Trends' },
      { key: 'expense_trends', label: 'Expense Trends' },
      { key: 'cash_metrics', label: 'Cash Metrics' },
      { key: 'risk_indicators', label: 'Risk Indicators' },
      { key: 'operational_metrics', label: 'Operational Metrics' },
    ];

    const chunks: Chunk[] = [];

    for (const { key, label } of sections) {
      const value = payload[key];
      if (value === undefined || value === null) continue;

      const content =
        typeof value === 'string'
          ? value
          : JSON.stringify(value, null, 2);

      chunks.push({
        text: `${period} — ${label}:\n${content}`,
        metadata: { ...baseMeta, section: key },
      });
    }

    if (chunks.length === 0) {
      // Fallback: treat the whole payload as a windowed body
      const body = JSON.stringify(payload, null, 2);
      return this.windowText(body, 400, 50).map((text) => ({
        text: `${period} — Financial Report:\n${text}`,
        metadata: baseMeta,
      }));
    }

    return chunks;
  }

  // ─── New: ai_insights ──────────────────────────────────────────────────────

  /**
   * Chunks AI-generated financial insights back into the RAG system.
   *
   * Expected payload fields:
   *  - content     : the full insight / analysis text
   *  - analysis_type : e.g. "financial_analysis", "cost_optimization", "risk_assessment"
   *  - generated_at  : ISO timestamp
   *  - org_slug     : tenant identifier
   */
  private aiInsights(payload: Record<string, unknown>): Chunk[] {
    const content = this.safeValue(payload, 'content', 'body', '');
    if (!content) {
      throw new BadRequestException('ai_insights payload must include a non-empty "content" field');
    }

    const analysisType = this.safeValue(payload, 'analysis_type', undefined, 'financial_analysis');
    const generatedAt = this.safeValue(payload, 'generated_at', undefined, new Date().toISOString());
    const orgSlug = this.safeValue(payload, 'org_slug', undefined, 'unknown');

    const header = `AI Insight [${analysisType}] generated at ${generatedAt} for org: ${orgSlug}.\n`;
    const baseMeta = { ...this.metadata(payload), analysis_type: analysisType, generated_at: generatedAt };

    return this.windowText(content, 400, 50).map((text) => ({
      text: `${header}${text}`,
      metadata: baseMeta,
    }));
  }

  private genericRecord(
    label: string,
    payload: Record<string, unknown>,
  ): Chunk {
    return {
      text: `${label} record: ${JSON.stringify(payload)}`,
      metadata: this.metadata(payload),
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private windowed(
    payload: Record<string, unknown>,
    field: string,
    size: number,
    overlap: number,
    metadata: Record<string, unknown>,
  ): Chunk[] {
    return this.windowText(this.value(payload, field), size, overlap).map((text) => ({
      text,
      metadata,
    }));
  }

  private windowText(text: string, size: number, overlap: number): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const chunks: string[] = [];
    for (let start = 0; start < words.length; start += size - overlap) {
      chunks.push(words.slice(start, start + size).join(' '));
      if (start + size >= words.length) break;
    }
    return chunks.length ? chunks : [text];
  }

  private metadata(payload: Record<string, unknown>): Record<string, unknown> {
    const {
      body: _body,
      sections: _sections,
      line_items: _lineItems,
      extracted_text: _text,
      forecast_output: _forecast,
      income_statement: _is,
      balance_sheet: _bs,
      cash_flow_statement: _cf,
      revenue_trends: _rt,
      expense_trends: _et,
      cash_metrics: _cm,
      risk_indicators: _ri,
      operational_metrics: _om,
      content: _content,
      ...metadata
    } = payload;
    return metadata;
  }

  private money(payload: Record<string, unknown>, field: string): string {
    return `${this.safeValue(payload, 'currency', undefined, '')} ${this.value(payload, field)}`.trim();
  }

  private optionalSentence(payload: Record<string, unknown>, field: string, prefix: string): string {
    const value = payload[field];
    return value === undefined || value === null || value === '' ? '' : `${prefix}${String(value)}`;
  }

  /** Strict value — throws if missing. */
  private value(
    payload: Record<string, unknown>,
    primary: string,
    secondary?: string,
    fallback?: string,
  ): string {
    const value =
      payload[primary] ?? (secondary ? payload[secondary] : undefined) ?? fallback;
    if (value === undefined || value === null || value === '') {
      throw new BadRequestException(`Missing required payload field: ${primary}`);
    }
    return Array.isArray(value) || this.asRecord(value)
      ? JSON.stringify(value)
      : String(value);
  }

  /** Safe value — returns empty string if missing (no throw). */
  private safeValue(
    payload: Record<string, unknown>,
    primary: string,
    secondary?: string,
    fallback?: string,
  ): string {
    const value =
      payload[primary] ?? (secondary ? payload[secondary] : undefined) ?? fallback ?? '';
    return Array.isArray(value) || this.asRecord(value)
      ? JSON.stringify(value)
      : String(value);
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private title(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }
}
