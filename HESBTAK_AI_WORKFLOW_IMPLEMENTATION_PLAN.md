# Hesbtak AI Workflow Implementation Plan

## Objective

Complete the Hesbtak AI backend workflow so it can extract invoice data, classify the accounting action, propose account and party mappings, generate balanced journal proposals, optionally generate payment proposals, and pause for explicit human approval after every AI-generated step.

The AI backend will only return proposals and recommendations. It will not create customers, vendors, accounts, journal entries, payments, or any other business records in the main PostgreSQL database. The main backend remains responsible for validation and persistence.

## Current Starting Point

The repository already contains an AI NestJS application under `AI/` with:

- A `workflow` module and controller.
- Workflow DTOs, status enums, and step enums.
- Invoice extraction prompt support using Qwen.
- Classification and account mapping services/prompts.
- File upload, PDF-to-image, base64, and safe JSON utilities.

The remaining work is to turn the partial sequential flow into a complete approval-driven LangGraph workflow and align the API contract with the main backend integration requirements.

## Work To Be Done

### 1. Define Stable Workflow Contracts

I will add or refine TypeScript DTOs and types for:

- Workflow creation input: `documentSide` and `paymentStatus`.
- Extraction result.
- Classification result.
- Account mapping request and proposal.
- Journal entry proposal.
- Payment proposal.
- Human approval responses.
- Workflow status responses.

Every API response from the AI backend will use predictable JSON shapes, especially:

```json
{
  "status": "WAITING_FOR_APPROVAL",
  "step": "ACCOUNT_MAPPING",
  "data": {}
}
```

### 2. Implement LangGraph Workflow Orchestration

I will replace the current mostly sequential controller-driven flow with a LangGraph state machine.

The graph will contain these nodes:

1. Extraction Node
2. Human Approval Node
3. Classification Node
4. Human Approval Node
5. Account Mapping Node
6. Human Approval Node
7. Journal Entry Node
8. Human Approval Node
9. Payment Node
10. Human Approval Node
11. Complete

The graph will stop after each AI proposal and wait until the matching confirmation endpoint is called.

### 3. Build Extraction Node

I will complete the document extraction step so it accepts:

- Invoice image files.
- Invoice PDFs converted to images before extraction.
- `documentSide`.
- `paymentStatus`.

The extraction output will follow this contract:

```json
{
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
```

### 4. Build Classification Node

I will implement classification using the confirmed extraction result plus `documentSide` and `paymentStatus`.

The output will be:

```json
{
  "documentType": "CUSTOMER_INVOICE",
  "accountingAction": "REVENUE",
  "requiresPayment": true,
  "requiresCustomer": true,
  "requiresVendor": false
}
```

Valid values will be enforced before returning the proposal.

### 5. Build Account Mapping Node

I will implement account and party proposal logic using:

- Confirmed extraction.
- Confirmed classification.
- Chart of accounts from the main backend.
- Customers from the main backend.
- Vendors from the main backend.

The AI backend will only propose whether to use an existing customer/vendor or create one. It will not create any record directly.

Each account mapping will include:

- Line description.
- Proposed account ID.
- Proposed account name.
- Confidence score.
- Explainable reasoning where useful for review.

### 6. Build Journal Entry Node

I will implement journal proposal generation with strict accounting validation.

The journal output will include:

```json
{
  "journalEntry": {
    "description": "",
    "referenceType": "",
    "date": ""
  },
  "lines": [
    {
      "accountId": "",
      "accountName": "",
      "debit": 0,
      "credit": 0,
      "reason": ""
    }
  ]
}
```

Validation rules:

- Total debits must equal total credits.
- No unbalanced journal proposal may be returned as approved-ready.
- Every line must include a reason.
- The proposal must preserve the accounting equation.

If the model output is invalid or unbalanced, the backend will either repair it deterministically when safe or return a failed proposal state that requires regeneration.

### 7. Build Payment Node

I will implement the payment proposal step only when `paymentStatus` is `paid`.

The payment output will be:

```json
{
  "paymentRequired": true,
  "paymentType": "CUSTOMER_PAYMENT",
  "amount": 0,
  "paymentDate": "",
  "journalLines": []
}
```

If `paymentStatus` is `unpaid`, the graph will skip payment proposal generation and move to completion after journal approval.

### 8. Add Human Approval Gates

I will add explicit confirmation handling for:

- Extraction.
- Classification.
- Account mapping.
- Journal proposal.
- Payment proposal.

Each confirmation endpoint will:

- Load the current workflow state.
- Verify that the workflow is waiting on the expected step.
- Store the approved proposal in workflow state.
- Advance the graph to the next node.
- Return the next waiting state or completed state.

### 9. Expose Required API Endpoints

I will align the AI backend controller with the required contract:

- `POST /workflow`
- `POST /workflow/:id/upload`
- `POST /workflow/:id/confirm-extraction`
- `POST /workflow/:id/confirm-classification`
- `POST /workflow/:id/confirm-account-mapping`
- `POST /workflow/:id/confirm-journal`
- `POST /workflow/:id/confirm-payment`
- `GET /workflow/:id`

The upload endpoint starts extraction. The confirmation endpoints advance the graph only after explicit user approval.

### 10. Remove Direct Business Persistence From AI Flow

I will make sure the AI backend does not write final accounting records.

The AI backend may keep temporary workflow state only if needed to resume approvals, but it must not:

- Create accounts.
- Create customers.
- Create vendors.
- Create journal entries.
- Create payments.
- Mutate tenant accounting records.

If the existing `PrismaService` is kept in the AI backend, it will only be used for workflow session state, not final business persistence.

### 11. Add Output Validation

I will add validation around all model outputs so invalid JSON, missing fields, invalid enum values, missing confidence scores, missing reasons, or unbalanced journal lines do not silently pass through.

This includes:

- Safe JSON parsing.
- Schema validation.
- Enum validation.
- Numeric normalization.
- Debit/credit balance checks.
- Required explanation checks.

### 12. Add Tests

I will add focused tests for:

- Workflow creation.
- Upload returning extraction review state.
- Each approval endpoint enforcing the correct current step.
- Classification based on `documentSide` and `paymentStatus`.
- Account mapping requiring confidence scores.
- Journal validation rejecting unbalanced entries.
- Payment step executing only for paid documents.
- Unpaid workflows completing after journal approval.

## Expected Final Behavior

The main backend can use the AI backend as a proposal engine:

1. Create workflow.
2. Upload invoice document.
3. Receive extraction proposal and show it to the user.
4. Confirm extraction.
5. Receive classification proposal and show it to the user.
6. Confirm classification.
7. Send accounts/customers/vendors context.
8. Receive account mapping proposal and show it to the user.
9. Confirm account mapping.
10. Receive balanced journal proposal and show it to the user.
11. Confirm journal.
12. If paid, receive payment proposal and confirm it.
13. Main backend persists the final approved records.

## Non-Goals

This implementation will not:

- Persist final accounting records from the AI backend.
- Automatically create accounts, customers, vendors, journals, or payments.
- Bypass human approval.
- Return unbalanced journal entries as valid proposals.
- Replace main backend validation.

## Verification Plan

After implementation, I will verify the workflow with:

- Unit tests for workflow state transitions and validation.
- Controller tests for the required API contract.
- Manual API checks for paid and unpaid scenarios.
- A balanced journal check for both customer invoice and vendor bill examples.

