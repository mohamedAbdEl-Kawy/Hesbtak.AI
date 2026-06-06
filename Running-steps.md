# Running Steps

## 1. Required Services

You need:

- Node.js
- Docker Desktop
- PostgreSQL and Redis from `Back/docker-compose.yml`
- Hugging Face token for the AI models

## 2. Configure Environment

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

Create `Front/.env`:

```bash
VITE_API_URL=http://localhost:3000/api/v1
```

## 3. Start Database Services

Open terminal 1:

```bash
cd Back
docker compose up -d postgres redis
```

## 4. Start Main Backend

Open terminal 2:

```bash
cd Back
npm install
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

Backend URL:

```text
http://localhost:3000/api/v1
```

AI workflow URL:

```text
http://localhost:3000/api/v1/ai/workflow
```

There is no separate AI server now. The AI workflow runs inside the main backend.

## 5. Start Frontend

Open terminal 3:

```bash
cd Front
npm install
npm run dev
```

Frontend URL:

```text
http://localhost:5173
```

## 6. Verify Build And Tests

Backend:

```bash
cd Back
npm run build
npm run test -- --runInBand
```

Frontend:

```bash
cd Front
npm run build
```

## 7. Postman Setup

Create these Postman variables:

```text
baseUrl = http://localhost:3000/api/v1
token = paste-login-access-token-here
tenantId = paste-organization-id-here
workflowId = paste-created-workflow-id-here
```

For protected routes, add headers:

```text
Authorization: Bearer {{token}}
x-tenant-id: {{tenantId}}
Content-Type: application/json
```

## 8. Register User And Organization

Method:

```text
POST {{baseUrl}}/auth/register
```

Body:

```json
{
  "fullName": "Mona Owner",
  "email": "owner@example.com",
  "password": "Password123!",
  "organizationName": "Nile Retail",
  "industry": "Retail",
  "currency": "EGP"
}
```

Copy from the response:

- `accessToken` into `token`
- organization `id` into `tenantId`

## 9. Login

Method:

```text
POST {{baseUrl}}/auth/login
```

Body:

```json
{
  "email": "owner@example.com",
  "password": "Password123!"
}
```

Copy from the response:

- `accessToken` into `token`
- first tenant `organizationId` into `tenantId`

## 10. Check Tenant Accounts

This confirms the tenant chart of accounts exists. The autonomous AI account mapping uses this data.

Method:

```text
GET {{baseUrl}}/tenant/accounts
```

Headers:

```text
Authorization: Bearer {{token}}
x-tenant-id: {{tenantId}}
```

Expected accounts include:

- `1000` Cash and Bank
- `1100` Accounts Receivable
- `2000` Accounts Payable
- `4000` Sales Revenue
- `5000` Operating Expenses

## 11. Create AI Workflow

Method:

```text
POST {{baseUrl}}/ai/workflow
```

Headers:

```text
Authorization: Bearer {{token}}
x-tenant-id: {{tenantId}}
Content-Type: application/json
```

Customer invoice body:

```json
{
  "documentSide": "customer",
  "paymentStatus": "paid"
}
```

Vendor bill body:

```json
{
  "documentSide": "vendor",
  "paymentStatus": "unpaid"
}
```

Copy response `id` into Postman variable `workflowId`.

## 12. Upload Invoice And Run Autonomous Workflow

Method:

```text
POST {{baseUrl}}/ai/workflow/{{workflowId}}/upload
```

Headers:

```text
Authorization: Bearer {{token}}
x-tenant-id: {{tenantId}}
```

Body:

- Select `form-data`
- Add key `file`
- Set type to `File`
- Pick an invoice image or PDF

Expected success response:

```json
{
  "status": "COMPLETED",
  "step": "COMPLETE",
  "data": {
    "documentSide": "customer",
    "paymentStatus": "paid",
    "extractionProposal": {},
    "approvedExtraction": {},
    "classificationProposal": {},
    "approvedClassification": {},
    "mappingContext": {},
    "accountMappingProposal": {},
    "approvedAccountMapping": {},
    "journalProposal": {},
    "approvedJournal": {},
    "paymentProposal": {},
    "approvedPayment": {},
    "persistedRecords": {},
    "systemApprovals": []
  }
}
```

For unpaid workflows, `paymentProposal` and `approvedPayment` are not created.

After all system approval rules pass, the backend also creates the final accounting records automatically:

- Customer invoice workflow creates or reuses the customer, creates the invoice, creates the journal through the accounting service, and creates a customer payment if `paymentStatus` is `paid`.
- Vendor bill workflow creates or reuses the vendor, creates the vendor bill, creates the journal through the accounting service, and creates a vendor payment if `paymentStatus` is `paid`.

Created record IDs are returned in:

```text
data.persistedRecords
```

Example:

```json
{
  "persistedRecords": {
    "customerId": "customer-id",
    "invoiceId": "invoice-id",
    "paymentId": "payment-id"
  }
}
```

Vendor example:

```json
{
  "persistedRecords": {
    "vendorId": "vendor-id",
    "vendorBillId": "vendor-bill-id"
  }
}
```

## 13. Get Workflow Status

Method:

```text
GET {{baseUrl}}/ai/workflow/{{workflowId}}
```

Headers:

```text
Authorization: Bearer {{token}}
x-tenant-id: {{tenantId}}
```

Use this route to inspect:

- `currentStep`
- `status`
- extracted data
- classification
- account mappings
- journal proposal
- payment proposal
- `systemApprovals`
- `persistedRecords`
- `automationError` if a rule failed

## 14. Manual Confirmation Routes Are Disabled

These routes exist only to return a clear error:

```text
POST /ai/workflow/:id/confirm-extraction
POST /ai/workflow/:id/confirm-classification
POST /ai/workflow/:id/confirm-account-mapping
POST /ai/workflow/:id/confirm-journal
POST /ai/workflow/:id/confirm-payment
```

Expected response:

```json
{
  "message": "Manual confirmation is disabled. Upload a document and the backend will run system approvals automatically."
}
```

## 15. System Approval Rules

The backend automatically approves each step only if these checks pass:

- Extraction has total greater than zero.
- Extraction has issue date.
- Extraction has at least one line item.
- Customer invoices have customer name.
- Vendor bills have vendor name.
- Classification matches `documentSide`.
- Payment requirement matches `paymentStatus`.
- Account mappings reference existing tenant accounts.
- Account mapping confidence is at least `0.7`.
- Required existing customers/vendors reference existing tenant records.
- Required created customers/vendors include a name.
- Journal proposal is balanced.
- Every journal line has a reason.
- Journal accounts exist in tenant chart of accounts.
- Paid workflow payment amount equals extracted invoice total.
- Payment journal lines are balanced.
- Payment accounts exist in tenant chart of accounts.

If any rule fails, workflow status becomes:

```text
FAILED
```

The failure reason is stored in:

```text
payload.automationError
```

## 16. Verify Created Accounting Records

After a completed autonomous workflow, use the IDs from `persistedRecords` or inspect the tenant lists.

Customer invoices:

```text
GET {{baseUrl}}/tenant/invoices
```

Vendor bills:

```text
GET {{baseUrl}}/tenant/vendor-bills
```

Journal entries:

```text
GET {{baseUrl}}/tenant/journal-entries
```

Customers:

```text
GET {{baseUrl}}/tenant/customers
```

Vendors:

```text
GET {{baseUrl}}/tenant/vendors
```

Headers:

```text
Authorization: Bearer {{token}}
x-tenant-id: {{tenantId}}
```
