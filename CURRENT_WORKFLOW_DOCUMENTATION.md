# Current Workflow, AI, And API Documentation

## Project Overview

Hesbtak now runs with one backend service and one frontend:

- `Back/`: Main NestJS backend for auth, tenants, accounting validation, database writes, and the AI workflow module.
- `Front/`: TanStack/Vite frontend.

The most important rule is that the AI module is a proposal engine only. It can store temporary workflow session state, but it must not create final business records such as accounts, customers, vendors, journals, invoices, bills, or payments. The main backend validates and persists final approved data.

## Architecture

```text
Frontend
  |
  | user login, tenant accounting, AI workflow actions
  v
Main Backend: http://localhost:3000/api/v1
  |
  | routes /ai/workflow/* to the internal AI module
  v
AI Module inside Back/src/modules/ai
  |
  | returns proposals only, each requiring user approval
  v
Main Backend
  |
  | validates and writes final approved records
  v
PostgreSQL
```

## AI Workflow

The AI workflow is implemented inside the main backend at `Back/src/modules/ai`. The workflow uses LangGraph to run one AI step at a time and the API stops after every generated proposal.

Workflow order:

1. Create workflow session.
2. Upload invoice image or PDF.
3. AI extracts invoice data.
4. User confirms extraction.
5. AI classifies the document.
6. User confirms classification and sends accounts/customers/vendors context.
7. AI proposes customer/vendor handling and account mappings.
8. User confirms account mapping.
9. AI proposes balanced journal entry.
10. User confirms journal.
11. If `paymentStatus` is `paid`, AI proposes payment journal lines.
12. User confirms payment.
13. Workflow completes.

For `paymentStatus = unpaid`, the workflow completes after journal approval.

## AI Workflow States

The AI module stores temporary workflow state in `workflow_sessions`.

Main states:

- `PENDING`
- `WAITING_FOR_APPROVAL`
- `COMPLETED`
- `FAILED`

Main steps:

- `EXTRACTION`
- `EXTRACTION_REVIEW`
- `CLASSIFICATION_REVIEW`
- `ACCOUNT_MAPPING_REVIEW`
- `JOURNAL_REVIEW`
- `PAYMENT_REVIEW`
- `COMPLETED`

Each AI proposal response uses this shape:

```json
{
  "status": "WAITING_FOR_APPROVAL",
  "step": "ACCOUNT_MAPPING",
  "data": {}
}
```

## AI Module Rules

- AI module never writes final accounting records.
- AI module never creates accounts directly.
- AI module never creates customers or vendors directly.
- AI module never creates journal entries directly.
- AI module only returns proposals and recommendations.
- Every AI-generated step requires explicit user approval.
- Every account mapping contains a confidence score.
- Every journal line contains a reason.
- Journal proposals must be balanced.
- Payment proposals must be balanced.

## AI Workflow API

Local base URL:

```text
http://localhost:3000/api/v1
```

All AI workflow endpoints are protected by JWT and tenant membership.

Required headers:

```text
Authorization: Bearer <JWT>
x-tenant-id: <organizationId>
Content-Type: application/json
```

### Create Workflow

```http
POST /ai/workflow
Content-Type: application/json
```

Request:

```json
{
  "documentSide": "customer",
  "paymentStatus": "paid"
}
```

Allowed values:

- `documentSide`: `customer`, `vendor`
- `paymentStatus`: `paid`, `unpaid`

Response:

```json
{
  "id": "workflow-id",
  "organizationId": "org-demo-id",
  "createdBy": "user-demo-id",
  "currentStep": "EXTRACTION",
  "status": "PENDING",
  "payload": {
    "documentSide": "customer",
    "paymentStatus": "paid"
  }
}
```

### Get Workflow

```http
GET /ai/workflow/:id
```

Response contains the stored workflow session, current step, status, and payload.

### Upload Invoice Document

```http
POST /ai/workflow/:id/upload
Content-Type: multipart/form-data
```

Form data:

```text
file=<invoice image or PDF>
```

Response:

```json
{
  "status": "WAITING_FOR_APPROVAL",
  "step": "EXTRACTION",
  "data": {
    "invoiceNumber": "",
    "vendorName": "",
    "customerName": "",
    "issueDate": "",
    "dueDate": "",
    "subtotal": 0,
    "taxAmount": 0,
    "total": 0,
    "currency": "",
    "lineItems": []
  }
}
```

### Confirm Extraction

```http
POST /ai/workflow/:id/confirm-extraction
Content-Type: application/json
```

Request can be empty to approve the AI proposal:

```json
{}
```

Or it can include corrected data:

```json
{
  "approvedData": {
    "invoiceNumber": "INV-1001",
    "vendorName": "Vendor Name",
    "customerName": "Customer Name",
    "issueDate": "2026-06-06",
    "dueDate": "2026-06-20",
    "subtotal": 1000,
    "taxAmount": 140,
    "total": 1140,
    "currency": "EGP",
    "lineItems": [
      {
        "description": "Consulting service",
        "quantity": 1,
        "unitPrice": 1000,
        "taxAmount": 140,
        "lineTotal": 1140
      }
    ]
  }
}
```

Response:

```json
{
  "status": "WAITING_FOR_APPROVAL",
  "step": "CLASSIFICATION",
  "data": {
    "documentType": "CUSTOMER_INVOICE",
    "accountingAction": "REVENUE",
    "requiresPayment": false,
    "requiresCustomer": true,
    "requiresVendor": false
  }
}
```

### Confirm Classification

This endpoint approves classification and sends main-backend context needed for account mapping.

```http
POST /ai/workflow/:id/confirm-classification
Content-Type: application/json
```

Request:

```json
{
  "context": {
    "accounts": [
      {
        "id": "account-id",
        "name": "Sales Revenue",
        "type": "Revenue"
      }
    ],
    "customers": [
      {
        "id": "customer-id",
        "name": "Existing Customer"
      }
    ],
    "vendors": [
      {
        "id": "vendor-id",
        "name": "Existing Vendor"
      }
    ]
  }
}
```

Optional corrected classification:

```json
{
  "approvedData": {
    "documentType": "CUSTOMER_INVOICE",
    "accountingAction": "REVENUE",
    "requiresPayment": false,
    "requiresCustomer": true,
    "requiresVendor": false
  },
  "context": {
    "accounts": [],
    "customers": [],
    "vendors": []
  }
}
```

Response:

```json
{
  "status": "WAITING_FOR_APPROVAL",
  "step": "ACCOUNT_MAPPING",
  "data": {
    "customerProposal": {
      "action": "USE_EXISTING",
      "customerId": "customer-id",
      "customerName": "Existing Customer"
    },
    "vendorProposal": {
      "action": "CREATE",
      "vendorId": "",
      "vendorName": ""
    },
    "accountMappings": [
      {
        "lineDescription": "Consulting service",
        "accountId": "account-id",
        "accountName": "Sales Revenue",
        "confidence": 0.95,
        "reason": "The line item represents earned service revenue."
      }
    ]
  }
}
```

### Confirm Account Mapping

```http
POST /ai/workflow/:id/confirm-account-mapping
Content-Type: application/json
```

Request can be empty:

```json
{}
```

Or corrected:

```json
{
  "approvedData": {
    "customerProposal": {
      "action": "USE_EXISTING",
      "customerId": "customer-id",
      "customerName": "Existing Customer"
    },
    "vendorProposal": {
      "action": "CREATE",
      "vendorId": "",
      "vendorName": ""
    },
    "accountMappings": [
      {
        "lineDescription": "Consulting service",
        "accountId": "account-id",
        "accountName": "Sales Revenue",
        "confidence": 0.95,
        "reason": "Approved by reviewer."
      }
    ]
  }
}
```

Response:

```json
{
  "status": "WAITING_FOR_APPROVAL",
  "step": "JOURNAL",
  "data": {
    "journalEntry": {
      "description": "Invoice INV-1001",
      "referenceType": "CUSTOMER_INVOICE",
      "date": "2026-06-06"
    },
    "lines": [
      {
        "accountId": "ar-account-id",
        "accountName": "Accounts Receivable",
        "debit": 1140,
        "credit": 0,
        "reason": "Record amount owed by customer."
      },
      {
        "accountId": "revenue-account-id",
        "accountName": "Sales Revenue",
        "debit": 0,
        "credit": 1140,
        "reason": "Record revenue from invoice."
      }
    ]
  }
}
```

### Confirm Journal

```http
POST /ai/workflow/:id/confirm-journal
Content-Type: application/json
```

Request can be empty:

```json
{}
```

Or corrected:

```json
{
  "approvedData": {
    "journalEntry": {
      "description": "Invoice INV-1001",
      "referenceType": "CUSTOMER_INVOICE",
      "date": "2026-06-06"
    },
    "lines": [
      {
        "accountId": "ar-account-id",
        "accountName": "Accounts Receivable",
        "debit": 1140,
        "credit": 0,
        "reason": "Record amount owed by customer."
      },
      {
        "accountId": "revenue-account-id",
        "accountName": "Sales Revenue",
        "debit": 0,
        "credit": 1140,
        "reason": "Record revenue from invoice."
      }
    ]
  }
}
```

If the workflow is unpaid, response:

```json
{
  "status": "COMPLETED",
  "step": "COMPLETE",
  "data": {}
}
```

If the workflow is paid, response:

```json
{
  "status": "WAITING_FOR_APPROVAL",
  "step": "PAYMENT",
  "data": {
    "paymentRequired": true,
    "paymentType": "CUSTOMER_PAYMENT",
    "amount": 1140,
    "paymentDate": "2026-06-06",
    "journalLines": [
      {
        "accountId": "cash-account-id",
        "accountName": "Cash",
        "debit": 1140,
        "credit": 0,
        "reason": "Record received payment."
      },
      {
        "accountId": "ar-account-id",
        "accountName": "Accounts Receivable",
        "debit": 0,
        "credit": 1140,
        "reason": "Clear customer receivable."
      }
    ]
  }
}
```

### Confirm Payment

```http
POST /ai/workflow/:id/confirm-payment
Content-Type: application/json
```

Request can be empty:

```json
{}
```

Or corrected:

```json
{
  "approvedData": {
    "paymentRequired": true,
    "paymentType": "CUSTOMER_PAYMENT",
    "amount": 1140,
    "paymentDate": "2026-06-06",
    "journalLines": [
      {
        "accountId": "cash-account-id",
        "accountName": "Cash",
        "debit": 1140,
        "credit": 0,
        "reason": "Record received payment."
      },
      {
        "accountId": "ar-account-id",
        "accountName": "Accounts Receivable",
        "debit": 0,
        "credit": 1140,
        "reason": "Clear customer receivable."
      }
    ]
  }
}
```

Response:

```json
{
  "status": "COMPLETED",
  "step": "COMPLETE",
  "data": {}
}
```

## Main Backend API

Main backend local base URL:

```text
http://localhost:3000/api/v1
```

The frontend uses this value from:

```text
Front/.env
VITE_API_URL=http://localhost:3000/api/v1
```

Protected tenant endpoints require:

```text
Authorization: Bearer <JWT>
x-tenant-id: <organizationId>
Content-Type: application/json
```

Important main backend areas:

- Auth: `/auth/register`, `/auth/login`, `/auth/forgot-password`, `/auth/verify-otp`, `/auth/reset-password`
- Tenant accounts: `/tenant/accounts`
- Customers: `/tenant/customers`
- Vendors: `/tenant/vendors`
- Customer invoices: `/tenant/invoices`
- Vendor bills: `/tenant/vendor-bills`
- Journal entries: `/tenant/journal-entries`
- Customer payments: `/tenant/customer-payments`
- Vendor payments: `/tenant/vendor-payments`
- Direct expenses: `/tenant/expenses`
- Dashboard: `/tenant/insights/dashboard`
- Forecasts: `/tenant/forecasts`
- Alerts: `/tenant/alerts`
- Suggestions: `/tenant/suggestions`
- Assistant: `/tenant/chatbot`

The main backend shows each AI proposal to the user, then persists final approved records through these tenant endpoints or internal services.

## Environment Setup

### Main Backend: `Back/.env`

Create `Back/.env` from `Back/.env.example`.

Recommended local values:

```bash
PORT=3000
APP_PORT=3000
NODE_ENV=development

POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=hesbtk
POSTGRES_PORT=5432
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hesbtk

REDIS_PASSWORD=redis
REDIS_PORT=6379
REDIS_URL=redis://:redis@localhost:6379

JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=1d

HF_TOKEN=your-hugging-face-token
```

### Frontend: `Front/.env`

Create `Front/.env` from `Front/.env.example`.

```bash
VITE_API_URL=http://localhost:3000/api/v1
```

## How To Run The Full Project Locally

Open three terminals.

### Terminal 1: Start Postgres And Redis

```bash
cd Back
docker compose up -d postgres redis
```

This starts:

- PostgreSQL on `localhost:5432`
- Redis on `localhost:6379`

### Terminal 2: Start Main Backend

```bash
cd Back
npm install
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

Main backend URL:

```text
http://localhost:3000/api/v1
```

### Terminal 3: Start Frontend

```bash
cd Front
npm install
npm run dev
```

Frontend URL:

```text
http://localhost:5173
```

## Build And Test Commands

Main backend:

```bash
cd Back
npm run build
npm run test
```

Frontend:

```bash
cd Front
npm run build
```

## Example AI Workflow With cURL

Set base URL:

```bash
BASE=http://localhost:3000/api/v1
TOKEN=<paste-access-token>
TENANT=<paste-organization-id>
```

Create workflow:

```bash
curl -X POST "$BASE/ai/workflow" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{ "documentSide": "customer", "paymentStatus": "paid" }'
```

Upload invoice:

```bash
curl -X POST "$BASE/ai/workflow/<workflow-id>/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT" \
  -F "file=@./invoice.png"
```

Confirm extraction:

```bash
curl -X POST "$BASE/ai/workflow/<workflow-id>/confirm-extraction" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Confirm classification and send accounting context:

```bash
curl -X POST "$BASE/ai/workflow/<workflow-id>/confirm-classification" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{
    "context": {
      "accounts": [
        { "id": "cash", "name": "Cash", "type": "Asset" },
        { "id": "ar", "name": "Accounts Receivable", "type": "Asset" },
        { "id": "revenue", "name": "Sales Revenue", "type": "Revenue" }
      ],
      "customers": [
        { "id": "cust-1", "name": "Acme Customer" }
      ],
      "vendors": []
    }
  }'
```

Confirm account mapping:

```bash
curl -X POST "$BASE/ai/workflow/<workflow-id>/confirm-account-mapping" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Confirm journal:

```bash
curl -X POST "$BASE/ai/workflow/<workflow-id>/confirm-journal" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Confirm payment if the workflow returns `step: PAYMENT`:

```bash
curl -X POST "$BASE/ai/workflow/<workflow-id>/confirm-payment" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Get workflow at any time:

```bash
curl "$BASE/ai/workflow/<workflow-id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT"
```

## Production Notes

- Keep final accounting persistence in the main backend.
- Do not expose `HF_TOKEN` to the frontend.
- Add request size limits and file type validation for production invoice uploads.
- Add retry/regeneration behavior for invalid model outputs.
