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
HF_TOKEN=replace-with-your-hugging-face-token
```

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

## AI Workflow

The AI workflow now runs as a module inside the main backend. There is no separate AI server to start.

Local API base:

```text
http://localhost:3000/api/v1/ai/workflow
```

Protected AI workflow routes require the same headers as tenant routes:

```text
Authorization: Bearer <JWT>
x-tenant-id: <organizationId>
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
- Real persistence bridge from approved AI workflow proposals into accounting records.
- Forecasting and chatbot currently use deterministic baseline logic from tenant ledger data.
- WebSocket push for notifications. Alerts are stored and fetched over HTTP.
