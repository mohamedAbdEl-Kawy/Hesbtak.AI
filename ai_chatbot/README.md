# Hesbetak.AI RAG Backend

NestJS backend for the Hesbetak.AI RAG v2 design using Prisma, PostgreSQL, and `pgvector`.

## Run With Docker

```bash
cp .env.example .env
docker compose up --build
```

The API listens on `http://localhost:3000`.

## RAG v2 Shape

- Tier 1: route exact numeric questions to deterministic financial tools.
- Tier 2: retrieve tenant financial context from `{tenant_schema}.embeddings`.
- Tier 3: assemble financial reports, tenant RAG chunks, onboarding context, and shared regulatory context.

## Main Endpoints

- `GET /health`
- `POST /tenants`
- `POST /tenants/:orgSlug/embeddings/ingest`
- `POST /tenants/:orgSlug/embeddings/upsert`
- `POST /tenants/:orgSlug/retrieval`
- `POST /tenants/:orgSlug/retrieval/route`
- `POST /regulatory/embeddings/upsert`
- `POST /regulatory/retrieval`

`EMBEDDING_PROVIDER=mock` creates deterministic local vectors for development. Set `EMBEDDING_PROVIDER=http` and `EMBEDDING_SERVICE_URL` to call a hosted BGE-compatible embedding service that returns `{ "embeddings": number[][] }`.

## Example Flow

Create a tenant:

```bash
curl -X POST http://localhost:3000/tenants \
  -H "Content-Type: application/json" \
  -d "{\"orgSlug\":\"acme-corp\"}"
```

Index a v2 invoice transaction chunk:

```bash
curl -X POST http://localhost:3000/tenants/acme-corp/embeddings/ingest \
  -H "Content-Type: application/json" \
  -d "{\"sourceType\":\"invoice_transaction\",\"sourceId\":\"inv-2026-0142\",\"payload\":{\"invoice_id\":\"uuid\",\"customer_id\":\"cust-1\",\"customer_name\":\"Cairo Tech Solutions\",\"invoice_number\":\"INV-2026-0142\",\"industry\":\"SaaS\",\"payment_terms\":\"NET30\",\"issue_date\":\"2026-02-15\",\"due_date\":\"2026-03-17\",\"total\":48500,\"subtotal\":45000,\"tax\":3500,\"currency\":\"EGP\",\"status\":\"overdue\",\"quarter\":\"Q1-2026\",\"line_items\":[\"Software License Renewal x1 @ EGP 35000\",\"Implementation Services x10hrs @ EGP 1000/hr\"],\"gl_accounts\":[\"1200\",\"2100\",\"4100\"],\"journal_entry_id\":\"JE-20260215-0088\"}}"
```

Index shared regulatory context:

```bash
curl -X POST http://localhost:3000/regulatory/embeddings/upsert \
  -H "Content-Type: application/json" \
  -d "{\"sourceType\":\"tax_law\",\"sourceId\":\"EG-VAT-2016-67\",\"jurisdiction\":\"EG\",\"industry\":\"ALL\",\"effectiveDate\":\"2016-09-01\",\"chunks\":[{\"chunkIndex\":0,\"text\":\"Egyptian VAT standard rate is 14%. VAT registered businesses must issue compliant e-invoices and file monthly VAT returns.\",\"metadata\":{\"authority\":\"Egyptian Tax Authority\",\"tags\":[\"vat\",\"e-invoice\"]}}]}"
```

Tier 2 semantic retrieval:

```bash
curl -X POST http://localhost:3000/tenants/acme-corp/retrieval \
  -H "Content-Type: application/json" \
  -d "{\"tier\":2,\"query\":\"Which overdue SaaS invoices affected Q1 revenue?\",\"filters\":{\"quarter\":\"Q1-2026\"},\"sourceTypes\":[\"invoice_transaction\"],\"k\":12}"
```

Tier 3 analysis retrieval:

```bash
curl -X POST http://localhost:3000/tenants/acme-corp/retrieval \
  -H "Content-Type: application/json" \
  -d "{\"tier\":3,\"query\":\"Give me a Q1 compliance and cash collection risk summary\",\"filters\":{\"quarter\":\"Q1-2026\"},\"regulatoryFilters\":{\"jurisdiction\":\"EG\",\"industry\":\"ALL\"},\"financialReports\":{\"income_statement\":{\"revenue\":1240000,\"currency\":\"EGP\"}},\"k\":20}"
```

Route a user query before retrieval:

```bash
curl -X POST http://localhost:3000/tenants/acme-corp/retrieval/route \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"What are my biggest cost optimization opportunities this quarter?\"}"
```
