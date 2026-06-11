# AI Chat and RAG Architecture

## Source ownership

- SQL is authoritative for accounts, transactions, invoices, bills, payments,
  balances, totals, counts, rankings, and period comparisons.
- RAG stores qualitative organization knowledge only.
- The reasoning agent combines verified SQL facts with optional RAG context.

## Supported RAG sources

- `onboarding_context`
- `uploaded_document`
- `ocr_document`
- `report_commentary`
- `approved_insight`
- `policy_or_regulation`

Raw accounting records must not be embedded. An `approved_insight` must include
`approved: true`; ordinary assistant answers are never indexed automatically.

## Ingestion payload

```json
{
  "sourceType": "uploaded_document",
  "sourceId": "audit-report-2026",
  "payload": {
    "title": "2026 Audit Report",
    "document_type": "audit_report",
    "period_start": "2026-01-01",
    "period_end": "2026-12-31",
    "sections": {
      "inventory_controls": "Document text...",
      "receivables": "Document text..."
    }
  }
}
```

Content may be supplied through `sections`, `content`, `body`,
`extracted_text`, `commentary`, or `text`.

## Chat routing

- Exact financial facts and record searches go to the database agent.
- Questions about document content go to the RAG agent.
- Analysis, recommendations, forecasts, and reports go to the reasoning agent.

## Reasoning contract

The reasoning agent receives:

1. `[VERIFIED SQL FINANCIAL DATA]`
2. `[DOCUMENT CONTEXT]`

Numbers must come from SQL. Qualitative document claims must cite `[SOURCE N]`.
Documents are not used to calculate totals. When SQL and documents conflict,
SQL wins for financial facts and the conflict should be disclosed.
