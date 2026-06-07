# Hesbtk.AI Backend

NestJS API for a multi-tenant SMB ERP/accounting system. The platform uses one shared PostgreSQL database, public shared tables for platform data, and one PostgreSQL schema per tenant organization for ledger data.

## Implemented Flows

- Auth: registration, login, JWT guards, forgot-password OTP, OTP verification, password reset, invitations, invitation acceptance.
- Multi-tenancy: shared public `users`, `organizations`, `organization_users`, `invitations`, `plans`, `subscriptions`, `audit_logs`, and `password_reset_otps`; tenant schema provisioning at registration.
- Onboarding: single-answer endpoint remains available, plus frontend-priority batch completion endpoint.
- Accounting: chart of accounts, customers, vendors, journal entries, invoices, customer payments, vendor bills, vendor payments, direct expenses.
- Automation and insight: recurring entries, scheduled recurring processing, dashboard KPIs, baseline forecasts, chatbot ledger summary, alerts, suggestions.
- Frontend contract: protected tenant endpoints require `Authorization: Bearer <token>` and `x-tenant-id: <organizationId>`.

## Environment

Create `Back/.env` from `Back/.env.example`:

```bash
PORT=3000
APP_PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hesbtk
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=hesbtk
POSTGRES_PORT=5432
REDIS_PASSWORD=redis
REDIS_PORT=6379
REDIS_URL=redis://:redis@localhost:6379
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=1d
```

## Setup

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run seed
npm run start:dev
```

### Chatbot Test Seed

`npm run seed` creates or refreshes a deterministic company in the shared
`public` tables and its tenant schema, then rebuilds the tenant RAG index.
It only updates its own fixed test records and does not truncate the database.

```text
Organization: Cairo Consulting Group
Organization ID: 7004ba5a-3ae2-4007-9d1e-bcb228f7c518
Email: chatbot.test@hesbetak.local
Password: ChatbotTest123!
```

API base URL:

```text
http://localhost:3000/api/v1
```

## Sample Endpoint Tests

Set variables:

```bash
BASE=http://localhost:3000/api/v1
TOKEN=<paste-access-token>
TENANT=<paste-organization-id>
```

### Register

```bash
curl -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Mona Owner",
    "email": "owner@example.com",
    "password": "Password123!",
    "organizationName": "Nile Retail",
    "industry": "Retail",
    "currency": "EGP"
  }'
```

### Login

```bash
curl -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{ "email": "owner@example.com", "password": "Password123!" }'
```

### Forgot Password OTP

In development, the response includes `devCode` so the flow is testable without email infrastructure.

```bash
curl -X POST "$BASE/auth/forgot-password" \
  -H "Content-Type: application/json" \
  -d '{ "email": "owner@example.com" }'
```

```bash
curl -X POST "$BASE/auth/verify-otp" \
  -H "Content-Type: application/json" \
  -d '{ "email": "owner@example.com", "code": "<dev-code>" }'
```

```bash
curl -X POST "$BASE/auth/reset-password" \
  -H "Content-Type: application/json" \
  -d '{ "email": "owner@example.com", "code": "<dev-code>", "password": "NewPassword123!" }'
```

### Complete Onboarding In One Request

```bash
curl -X POST "$BASE/onboarding/$TENANT/complete" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "answers": [
      { "questionKey": "company_name", "answer": "Nile Retail" },
      { "questionKey": "industry", "answer": "Retail" },
      { "questionKey": "currency", "answer": "EGP" },
      { "questionKey": "chart_preferences", "answer": "{\"qProducts\":true,\"qEmployees\":true}" }
    ]
  }'
```

### Tenant Headers

All `/tenant/*` endpoints require:

```text
Authorization: Bearer <JWT>
x-tenant-id: <organizationId>
Content-Type: application/json
```

### Accounts

```bash
curl "$BASE/tenant/accounts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT"
```

```bash
curl -X POST "$BASE/tenant/accounts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{ "code": "5800", "name": "Marketing", "type": "Expense" }'
```

### Customer, Invoice, Payment

```bash
curl -X POST "$BASE/tenant/customers" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Acme Customer", "email": "ap@acme.test" }'
```

```bash
curl -X POST "$BASE/tenant/invoices" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "<customer-id>",
    "issueDate": "2026-06-05",
    "dueDate": "2026-06-20",
    "lines": [{ "description": "Consulting service", "quantity": 2, "unitPrice": 1500, "taxRate": 14 }]
  }'
```

```bash
curl -X POST "$BASE/tenant/customer-payments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{ "entityId": "<invoice-id>", "amount": 3420, "paymentMethod": "cash", "paymentDate": "2026-06-06" }'
```

### Vendor Bill, Vendor Payment

```bash
curl -X POST "$BASE/tenant/vendors" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Supply Vendor", "email": "billing@supply.test" }'
```

```bash
curl -X POST "$BASE/tenant/vendor-bills" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{
    "vendorId": "<vendor-id>",
    "issueDate": "2026-06-05",
    "dueDate": "2026-06-18",
    "lines": [{ "description": "Office supplies", "quantity": 5, "unitPrice": 200, "taxRate": 14 }]
  }'
```

```bash
curl -X POST "$BASE/tenant/vendor-payments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{ "entityId": "<vendor-bill-id>", "amount": 1140, "paymentMethod": "cash", "paymentDate": "2026-06-07" }'
```

### Direct Expense

```bash
curl -X POST "$BASE/tenant/expenses" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{
    "expenseDate": "2026-06-05",
    "category": "Software",
    "description": "AWS monthly hosting",
    "amount": 128.50,
    "paymentMethod": "cash"
  }'
```

### Journal Entries

Use account IDs from `GET /tenant/accounts`.

```bash
curl -X POST "$BASE/tenant/journal-entries" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-06-05",
    "description": "Owner capital deposit",
    "lines": [
      { "accountId": "<cash-account-id>", "debit": 10000, "credit": 0 },
      { "accountId": "<equity-account-id>", "debit": 0, "credit": 10000 }
    ]
  }'
```

### Recurring Entries

```bash
curl -X POST "$BASE/tenant/recurring-entries" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Monthly wages",
    "frequency": "monthly",
    "startDate": "2026-06-01",
    "lines": [
      { "accountId": "<expense-account-id>", "debit": 5000, "credit": 0 },
      { "accountId": "<cash-account-id>", "debit": 0, "credit": 5000 }
    ]
  }'
```

```bash
curl -X POST "$BASE/tenant/recurring-entries/run" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT"
```

### Insights, Forecasts, Assistant, Alerts, Suggestions

```bash
curl "$BASE/tenant/insights/dashboard" -H "Authorization: Bearer $TOKEN" -H "x-tenant-id: $TENANT"
curl "$BASE/tenant/forecasts?months=12" -H "Authorization: Bearer $TOKEN" -H "x-tenant-id: $TENANT"
curl "$BASE/tenant/alerts" -H "Authorization: Bearer $TOKEN" -H "x-tenant-id: $TENANT"
curl "$BASE/tenant/suggestions" -H "Authorization: Bearer $TOKEN" -H "x-tenant-id: $TENANT"
```

```bash
curl -X POST "$BASE/tenant/chatbot" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{ "question": "How is my cash position?" }'
```

### Invitations

```bash
curl -X POST "$BASE/org/$TENANT/invitations" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "email": "accountant@example.com", "role": "accountant" }'
```

```bash
curl -X POST "$BASE/auth/accept-invitation" \
  -H "Authorization: Bearer <invitee-token>" \
  -H "Content-Type: application/json" \
  -d '{ "token": "<invitation-token>" }'
```

### Admin Dashboard

Requires `users.global_role = 'admin'`.

```bash
curl "$BASE/admin/dashboard" \
  -H "Authorization: Bearer $TOKEN"
```

## Notes

- Tenant schema names are generated as `tenant_<organization_uuid_with_underscores>` and validated before raw SQL use.
- Public/shared tables are Prisma models. Tenant schema tables are provisioned and queried with guarded raw SQL because schemas are dynamic.
- Email sending is stubbed. Development OTP responses expose `devCode`; replace this with a real email provider before production.
- Forecast and chatbot services are deterministic baselines ready for real ML/LLM integrations.
