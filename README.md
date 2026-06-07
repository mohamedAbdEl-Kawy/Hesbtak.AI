# Hesbtk.AI

Multi-tenant SMB ERP/accounting application with a NestJS backend and TanStack/Vite frontend.

## Architecture

- Shared PostgreSQL database.
- Public schema for platform data: users, organizations, memberships, invitations, plans, subscriptions, audit logs, password reset OTPs.
- One PostgreSQL schema per tenant for accounting data: accounts, onboarding responses, parties, bank accounts, journal entries, invoices, bills, payments, expenses, recurring entries, OCR records, AI conversations, forecasts, alerts, alert rules, suggestions.
- Frontend sends `Authorization: Bearer <token>` and `x-tenant-id: <organizationId>` for tenant endpoints.

## What Is Implemented

- Registration provisions user, organization, owner membership, tenant schema, and starter chart of accounts.
- Login stores JWT and tenant context in the frontend.
- Batch onboarding follows the frontend flow and posts all answers together.
- Forgot-password OTP, OTP verification, and password reset.
- Chart of accounts, invoices, expenses, journal, transactions, dashboard, forecasting, assistant, notifications, and admin pages are linked to backend endpoints.
- Direct expenses endpoint was added to match the frontend.
- Integrated multi-agent financial chatbot with tenant-scoped RAG.
- Accounting and onboarding API writes update the RAG index automatically.
- Backend sample endpoint tests are in [Back/README.md](./Back/README.md).

## Quick Start

Read [STARTUP_AND_ENV.md](./STARTUP_AND_ENV.md) for full setup and missing env values.

Typical local run:

```bash
cd Back
npm install
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

```bash
cd Front
npm install
npm run dev
```

Default URLs:

- Backend: `http://localhost:3000/api/v1`
- Frontend: `http://localhost:5173`

## AI Chatbot Module

The original `ai_chatbot` architecture is integrated under
`Back/src/modules/ai`:

- `embeddings`: source chunking, Hugging Face or mock embeddings, pgvector storage.
- `retrieval`: semantic retrieval over tenant embeddings.
- `langgraph`: original graph state, prompts, orchestrator, database search,
  RAG search, financial reasoning, report generation, and chatting agents.
- Backend `TenantModule`: the sole tenant authority. Its authenticated
  `TenantContext` is passed through embeddings, retrieval, and LangGraph.
- `prisma`: compatibility alias to the backend's shared database client.

The standalone chatbot's agent topology and response fields are preserved.
There is no chatbot-specific tenant module or tenant registry. The backend
integration adds JWT tenant authorization, conversation persistence, automatic
indexing, and frontend compatibility.

## AI Data Flow

1. An authenticated write API stores data in the active tenant schema.
2. The backend reads the complete stored record and upserts its vector chunk.
3. `/api/v1/tenant/chatbot` invokes the original LangGraph orchestrator.
4. It routes to `databaseSearchAgent`, `ragSearchAgent`,
   `financialReasoningAgent`, or the conversational fallback.
5. Financial reasoning continues through `reportGenerationAgent` before the
   final chatting agent.
6. The answer and session are stored in the tenant's `ai_conversations` table.

Use `POST /api/v1/tenant/rag/reindex` once for records created before this
integration.
