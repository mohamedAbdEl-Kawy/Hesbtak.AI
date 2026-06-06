# Hesbtk.AI

Multi-tenant SMB ERP/accounting application with a single NestJS backend service and a TanStack/Vite frontend.

## Architecture

- Shared PostgreSQL database.
- Public schema for platform data: users, organizations, memberships, invitations, plans, subscriptions, audit logs, password reset OTPs.
- One PostgreSQL schema per tenant for accounting data: accounts, onboarding responses, parties, bank accounts, journal entries, invoices, bills, payments, expenses, recurring entries, OCR records, AI conversations, forecasts, alerts, alert rules, suggestions.
- Frontend sends `Authorization: Bearer <token>` and `x-tenant-id: <organizationId>` for tenant endpoints.
- AI invoice workflow runs as an internal backend module at `/api/v1/ai/workflow`.
- The AI module only returns proposals; the backend remains responsible for validation and persistence.

## What Is Implemented

- Registration provisions user, organization, owner membership, tenant schema, and starter chart of accounts.
- Login stores JWT and tenant context in the frontend.
- Batch onboarding follows the frontend flow and posts all answers together.
- Forgot-password OTP, OTP verification, and password reset.
- Chart of accounts, invoices, expenses, journal, transactions, dashboard, forecasting, assistant, notifications, and admin pages are linked to backend endpoints.
- Direct expenses endpoint was added to match the frontend.
- AI workflow module for invoice extraction, classification, account mapping, balanced journal proposals, optional payment proposals, and human approval gates.
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
- AI workflow: `http://localhost:3000/api/v1/ai/workflow`
- Frontend: `http://localhost:5173`
