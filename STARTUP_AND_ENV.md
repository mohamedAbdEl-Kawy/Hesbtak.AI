# Startup And Env

## Required Local Services

- Node.js compatible with the installed dependencies.
- PostgreSQL with `pgvector` extension available. The provided Docker Compose uses `pgvector/pgvector:pg16`.
- Redis is included in Docker Compose but currently reserved for future queues/cache.

## Backend Env

Create `Back/.env` from `Back/.env.example`.

Required:

```bash
PORT=3000
APP_PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hesbtk
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=hesbtk
POSTGRES_PORT=5432
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=1d
AI_EMBEDDING_PROVIDER=mock
AI_EMBEDDING_DIMENSIONS=1024
```

AI providers:

```bash
# Required for the original multi-agent chatbot
GROQ_API_KEY=gsk_...
GROQ_CHAT_MODEL=meta-llama/llama-4-scout-17b-16e-instruct

# Required only for hosted BGE embeddings
AI_EMBEDDING_PROVIDER=huggingface
HF_TOKEN=hf_...
HF_EMBEDDING_MODEL=BAAI/bge-m3
```

`AI_EMBEDDING_PROVIDER=mock` is deterministic and offline. Keep
`AI_EMBEDDING_DIMENSIONS` unchanged after tenant RAG tables have been created.

Currently optional/reserved:

```bash
REDIS_PASSWORD=redis
REDIS_PORT=6379
REDIS_URL=redis://:redis@localhost:6379
```

Important: `docker-compose.yml` maps the backend container with `APP_PORT`, while Nest itself listens on `PORT`.

## Frontend Env

Create `Front/.env` from `Front/.env.example`.

```bash
VITE_API_URL=http://localhost:3000/api/v1
```

If this is missing, the frontend defaults to `http://localhost:3000/api/v1`.

## Start With Docker For Database

From `Back`:

```bash
docker compose up -d postgres redis
```

Then run the backend locally:

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

After logging in, index existing tenant records once:

```bash
curl -X POST http://localhost:3000/api/v1/tenant/rag/reindex \
  -H "Authorization: Bearer <access-token>" \
  -H "x-tenant-id: <organization-id>"
```

New records created through the account, customer, vendor, journal, invoice,
payment, bill, expense, and onboarding APIs are indexed automatically.

## Chatbot APIs

All endpoints require `Authorization: Bearer <token>` and `x-tenant-id`.
The backend resolves these through its existing `TenantModule`; the AI module
does not maintain a separate tenant model or tenant service.

```text
POST   /api/v1/tenant/chatbot
POST   /api/v1/tenant/chatbot/run
GET    /api/v1/tenant/chatbot/history
POST   /api/v1/tenant/embeddings/ingest
POST   /api/v1/tenant/embeddings/upsert
DELETE /api/v1/tenant/embeddings/:sourceType/:sourceId
POST   /api/v1/tenant/retrieval
GET    /api/v1/tenant/rag/status
POST   /api/v1/tenant/rag/reindex
```

`/tenant/chatbot` accepts the frontend-compatible `{ question, sessionId }`.
`/tenant/chatbot/run` accepts the original graph request with `userQuery`,
`financialReports`, `filters`, `regulatoryFilters`, and `filePayload`.

## Start Frontend

From `Front`:

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

## Build Checks

Backend:

```bash
cd Back
npm run build
```

Frontend:

```bash
cd Front
npm run build
```

## Missing Production Integrations

- Real email provider for OTP and invitation emails. Development forgot-password returns `devCode` so the flow can be tested.
- Real payment/subscription provider. The public `plans` and `subscriptions` models exist, but billing automation is not integrated.
- Real OCR extraction pipeline. The frontend OCR page is still a UI stub.
- Forecasting still uses deterministic baseline logic. The chatbot uses the
  integrated multi-agent database/RAG workflow; hosted LLM responses are
  enabled when `GROQ_API_KEY` is configured.
- WebSocket push for notifications. Alerts are stored and fetched over HTTP.
