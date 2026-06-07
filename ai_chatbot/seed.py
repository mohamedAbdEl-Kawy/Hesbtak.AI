"""
seed.py — Database seeder for Hesbetak.AI financial RAG system.

Creates a demo company (NovaTech Solutions) and populates the RAG
embeddings table with realistic financial data across all source types.

Usage:
    pip install requests
    python seed.py

Targets the locally running NestJS server at http://localhost:3000
"""

import requests
import json
import time
import sys

BASE_URL = "http://localhost:3000"
ORG_SLUG = "novatech"
DELAY = 0.4          # seconds between ingest calls (be kind to the embedding API)
VERBOSE = True


# ─── Helpers ──────────────────────────────────────────────────────────────────

def log(msg: str):
    if VERBOSE:
        print(msg)

def post(path: str, body: dict, label: str = "") -> dict:
    url = f"{BASE_URL}{path}"
    try:
        res = requests.post(url, json=body, timeout=60)
        if res.status_code >= 400:
            print(f"  ✗ [{label or path}] HTTP {res.status_code}: {res.text[:200]}")
            return {}
        data = res.json()
        log(f"  ✓ [{label}] {data}")
        return data
    except Exception as e:
        print(f"  ✗ [{label}] Error: {e}")
        return {}

def ingest(source_type: str, source_id: str, payload: dict):
    time.sleep(DELAY)
    return post(
        f"/tenants/{ORG_SLUG}/embeddings/ingest",
        {"sourceType": source_type, "sourceId": source_id, "payload": payload},
        label=f"{source_type} | {source_id}",
    )


# ─── Step 1: Create Tenant ─────────────────────────────────────────────────────

def create_tenant():
    log("\n━━━ Step 1: Creating tenant ━━━")
    return post(
        "/tenants",
        {"orgSlug": ORG_SLUG, "plan": "professional"},
        label="create tenant",
    )


# ─── Step 2: Onboarding Questionnaire ─────────────────────────────────────────

def seed_onboarding():
    log("\n━━━ Step 2: Onboarding questionnaire ━━━")
    ingest("onboarding_questionnaire", f"onboarding-{ORG_SLUG}-001", {
        "org_name": "NovaTech Solutions",
        "industry": "Software & Technology Services",
        "currency": "USD",
        "sections": {
            "business_overview": (
                "NovaTech Solutions is a B2B SaaS company founded in 2019, headquartered in Austin, Texas. "
                "We build cloud-based project management and analytics tools for mid-market enterprises. "
                "Current ARR is approximately $4.2M with 320 active customers across North America and Europe."
            ),
            "revenue_model": (
                "Subscription-based revenue with three tiers: Starter ($99/mo), Professional ($299/mo), "
                "and Enterprise (custom pricing). Professional plan accounts for 55% of revenue. "
                "Annual contracts are offered with a 15% discount. Implementation fees average $2,500 per Enterprise deal."
            ),
            "expense_structure": (
                "Major cost centers: cloud infrastructure (AWS) 22%, payroll & benefits 51%, "
                "sales & marketing 18%, G&A 9%. R&D capitalization policy applied for qualifying development costs. "
                "Headcount: 48 FTEs. Monthly burn rate approximately $310,000."
            ),
            "customer_profile": (
                "Ideal customer: 50-500 employee companies in manufacturing, logistics, and professional services. "
                "Top 5 customers account for 31% of ARR. Average contract value $13,200. "
                "Churn rate 6.2% annually. NPS score: 62."
            ),
            "vendor_relationships": (
                "Primary vendors: AWS (cloud infrastructure, $68,000/month), "
                "Stripe (payment processing, 2.9% + $0.30/transaction), "
                "HubSpot (CRM, $2,400/month), Zendesk (support, $1,800/month), "
                "GitHub (development tooling, $800/month). All critical vendor contracts renewed annually."
            ),
            "financial_goals": (
                "Target profitability by Q3 2026. Reach $6M ARR by year-end 2026. "
                "Expand into EMEA market. Launch AI-powered analytics module. "
                "Raise Series A ($8-12M) by Q2 2026. Improve gross margin from 68% to 75%."
            ),
            "accounting_policies": (
                "Revenue recognition per ASC 606, recognized ratably over subscription period. "
                "Fiscal year: January to December. Reporting currency: USD. "
                "Depreciation: straight-line over 3-5 years. Accounts receivable terms: Net 30. "
                "Cash basis for tax, accrual basis for GAAP reporting."
            ),
        },
    })


# ─── Step 3: Invoice Transactions ─────────────────────────────────────────────

INVOICES = [
    ("INV-2025-001", "Apex Manufacturing Co.", "2025-01-05", "2025-02-04", 24500.00, "paid",   "Q1", "Professional plan annual subscription + implementation"),
    ("INV-2025-002", "BlueSky Logistics",      "2025-01-10", "2025-02-09", 11880.00, "paid",   "Q1", "Professional plan annual x3 seats"),
    ("INV-2025-003", "Crestview Partners",     "2025-01-15", "2025-02-14", 35700.00, "paid",   "Q1", "Enterprise plan annual + onboarding"),
    ("INV-2025-004", "DataCore Systems",       "2025-01-20", "2025-02-19",  3564.00, "paid",   "Q1", "Starter plan annual x3"),
    ("INV-2025-005", "Evergreen Retail",       "2025-02-01", "2025-03-03",  8900.00, "paid",   "Q1", "Professional plan annual"),
    ("INV-2025-006", "FuturePath Consulting",  "2025-02-10", "2025-03-12", 15200.00, "paid",   "Q1", "Enterprise plan quarterly"),
    ("INV-2025-007", "Global Steel Ltd.",      "2025-02-14", "2025-03-16", 42000.00, "overdue","Q1", "Enterprise plan annual + custom integrations"),
    ("INV-2025-008", "Harbor Health Systems",  "2025-02-20", "2025-03-22", 12960.00, "paid",   "Q1", "Professional plan annual"),
    ("INV-2025-009", "InnovateTech GmbH",      "2025-03-01", "2025-03-31", 18700.00, "paid",   "Q1", "Enterprise plan quarterly + support"),
    ("INV-2025-010", "Jupiter Analytics",      "2025-03-15", "2025-04-14",  2376.00, "paid",   "Q1", "Starter plan annual x2"),
    ("INV-2025-011", "Keystone Pharma",        "2025-04-01", "2025-05-01", 53000.00, "paid",   "Q2", "Enterprise plan annual + data migration"),
    ("INV-2025-012", "LightBridge Media",      "2025-04-05", "2025-05-05",  8900.00, "paid",   "Q2", "Professional plan annual"),
    ("INV-2025-013", "MountainView Capital",   "2025-04-10", "2025-05-10", 17760.00, "paid",   "Q2", "Professional plan annual x2"),
    ("INV-2025-014", "NexGen Automotive",      "2025-04-22", "2025-05-22", 24500.00, "overdue","Q2", "Enterprise plan quarterly"),
    ("INV-2025-015", "OceanBridge Shipping",   "2025-05-01", "2025-05-31", 11880.00, "paid",   "Q2", "Professional plan annual"),
    ("INV-2025-016", "Pinnacle Realty Group",  "2025-05-12", "2025-06-11",  4752.00, "paid",   "Q2", "Starter plan annual x4"),
    ("INV-2025-017", "QuantumLeap AI",         "2025-05-20", "2025-06-19", 39600.00, "paid",   "Q2", "Enterprise plan annual"),
    ("INV-2025-018", "RedRock Construction",   "2025-06-01", "2025-07-01",  8900.00, "paid",   "Q2", "Professional plan annual"),
    ("INV-2025-019", "SkyHigh Ventures",       "2025-06-15", "2025-07-15", 71000.00, "paid",   "Q2", "Enterprise plan annual + custom dev"),
    ("INV-2025-020", "TrueNorth Energy",       "2025-06-25", "2025-07-25", 12960.00, "paid",   "Q2", "Professional plan annual"),
    ("INV-2025-021", "Apex Manufacturing Co.", "2025-07-01", "2025-07-31", 26000.00, "paid",   "Q3", "Enterprise upgrade + expansion"),
    ("INV-2025-022", "BlueSky Logistics",      "2025-07-10", "2025-08-09", 11880.00, "paid",   "Q3", "Professional plan renewal"),
    ("INV-2025-023", "Crestview Partners",     "2025-07-20", "2025-08-19", 35700.00, "paid",   "Q3", "Enterprise plan renewal"),
    ("INV-2025-024", "Unified Networks",       "2025-08-01", "2025-08-31", 22500.00, "paid",   "Q3", "Enterprise plan quarterly"),
    ("INV-2025-025", "Vertex Biotech",         "2025-08-15", "2025-09-14", 17760.00, "paid",   "Q3", "Professional plan annual"),
    ("INV-2025-026", "WestCoast Distributors", "2025-08-25", "2025-09-24", 13200.00, "partial","Q3", "Enterprise plan annual (partial payment received)"),
    ("INV-2025-027", "XLerate Sports",         "2025-09-05", "2025-10-05",  8900.00, "paid",   "Q3", "Professional plan annual"),
    ("INV-2025-028", "YieldPath Finance",      "2025-09-15", "2025-10-15", 53000.00, "paid",   "Q3", "Enterprise plan annual + training"),
    ("INV-2025-029", "Zenith Healthcare",      "2025-09-25", "2025-10-25", 24500.00, "overdue","Q3", "Enterprise plan quarterly"),
    ("INV-2025-030", "Alpha Dynamics",         "2025-10-01", "2025-10-31", 11880.00, "paid",   "Q4", "Professional plan renewal"),
]

def seed_invoices():
    log(f"\n━━━ Step 3: Ingesting {len(INVOICES)} invoices ━━━")
    for (inv_num, customer, issue_date, due_date, total, status, quarter, description) in INVOICES:
        subtotal = round(total / 1.08, 2)
        tax = round(total - subtotal, 2)
        ingest("invoice_transaction", inv_num, {
            "invoice_number": inv_num,
            "customer_name": customer,
            "industry": "Technology",
            "issue_date": issue_date,
            "due_date": due_date,
            "total": total,
            "subtotal": subtotal,
            "tax": tax,
            "currency": "USD",
            "status": status,
            "payment_terms": "Net 30",
            "quarter": quarter,
            "fiscal_year": "2025",
            "line_items": f"[{{'description': '{description}', 'amount': {total}}}]",
            "gl_debit_accounts": "['1100 - Accounts Receivable']",
            "gl_credit_accounts": "['4000 - Software Revenue']",
            "journal_entry_id": f"JE-{inv_num}",
            "created_by": "billing-system",
        })


# ─── Step 4: Vendor Bills ──────────────────────────────────────────────────────

VENDOR_BILLS = [
    # (bill_number, vendor, issue_date, due_date, total, status, payment_date, payment_method, category)
    ("VB-2025-001", "Amazon Web Services",    "2025-01-01", "2025-01-31", 68000.00, "paid",   "2025-01-28", "bank_transfer",  "Cloud Infrastructure"),
    ("VB-2025-002", "Amazon Web Services",    "2025-02-01", "2025-02-28", 71200.00, "paid",   "2025-02-25", "bank_transfer",  "Cloud Infrastructure"),
    ("VB-2025-003", "Amazon Web Services",    "2025-03-01", "2025-03-31", 73500.00, "paid",   "2025-03-28", "bank_transfer",  "Cloud Infrastructure"),
    ("VB-2025-004", "Amazon Web Services",    "2025-04-01", "2025-04-30", 74800.00, "paid",   "2025-04-28", "bank_transfer",  "Cloud Infrastructure"),
    ("VB-2025-005", "Amazon Web Services",    "2025-05-01", "2025-05-31", 76500.00, "paid",   "2025-05-29", "bank_transfer",  "Cloud Infrastructure"),
    ("VB-2025-006", "Amazon Web Services",    "2025-06-01", "2025-06-30", 79200.00, "paid",   "2025-06-27", "bank_transfer",  "Cloud Infrastructure"),
    ("VB-2025-007", "HubSpot Inc.",           "2025-01-01", "2025-01-31",  2400.00, "paid",   "2025-01-15", "credit_card",   "CRM Software"),
    ("VB-2025-008", "HubSpot Inc.",           "2025-02-01", "2025-02-28",  2400.00, "paid",   "2025-02-15", "credit_card",   "CRM Software"),
    ("VB-2025-009", "HubSpot Inc.",           "2025-03-01", "2025-03-31",  2400.00, "paid",   "2025-03-14", "credit_card",   "CRM Software"),
    ("VB-2025-010", "Zendesk Inc.",           "2025-01-01", "2025-01-31",  1800.00, "paid",   "2025-01-15", "credit_card",   "Customer Support"),
    ("VB-2025-011", "Zendesk Inc.",           "2025-02-01", "2025-02-28",  1800.00, "paid",   "2025-02-14", "credit_card",   "Customer Support"),
    ("VB-2025-012", "GitHub Inc.",            "2025-01-01", "2025-01-31",   800.00, "paid",   "2025-01-10", "credit_card",   "Development Tools"),
    ("VB-2025-013", "GitHub Inc.",            "2025-02-01", "2025-02-28",   800.00, "paid",   "2025-02-10", "credit_card",   "Development Tools"),
    ("VB-2025-014", "Salesforce Inc.",        "2025-02-15", "2025-03-15",  4500.00, "paid",   "2025-03-10", "bank_transfer",  "Marketing Tools"),
    ("VB-2025-015", "Office Depot",           "2025-01-20", "2025-02-19",  3200.00, "paid",   "2025-02-15", "credit_card",   "Office Supplies"),
    ("VB-2025-016", "WeWork Austin",          "2025-01-01", "2025-01-31", 12000.00, "paid",   "2025-01-05", "bank_transfer",  "Office Rent"),
    ("VB-2025-017", "WeWork Austin",          "2025-02-01", "2025-02-28", 12000.00, "paid",   "2025-02-05", "bank_transfer",  "Office Rent"),
    ("VB-2025-018", "WeWork Austin",          "2025-03-01", "2025-03-31", 12000.00, "paid",   "2025-03-05", "bank_transfer",  "Office Rent"),
    ("VB-2025-019", "DataDog Inc.",           "2025-03-01", "2025-03-31",  5200.00, "paid",   "2025-03-25", "credit_card",   "Monitoring & Observability"),
    ("VB-2025-020", "Stripe Inc.",            "2025-01-31", "2025-02-28",  2840.00, "paid",   "2025-02-20", "bank_transfer",  "Payment Processing Fees"),
    ("VB-2025-021", "Stripe Inc.",            "2025-02-28", "2025-03-31",  3120.00, "paid",   "2025-03-20", "bank_transfer",  "Payment Processing Fees"),
    ("VB-2025-022", "Stripe Inc.",            "2025-03-31", "2025-04-30",  3380.00, "paid",   "2025-04-20", "bank_transfer",  "Payment Processing Fees"),
    ("VB-2025-023", "TechRecruit Partners",   "2025-04-15", "2025-05-15", 18000.00, "paid",   "2025-05-10", "bank_transfer",  "Recruitment Fees"),
    ("VB-2025-024", "LegalEdge LLP",         "2025-05-01", "2025-05-31",  7500.00, "paid",   "2025-05-28", "bank_transfer",  "Legal Services"),
    ("VB-2025-025", "Deloitte Advisory",      "2025-06-01", "2025-06-30", 22000.00, "overdue",None,          "bank_transfer",  "Consulting Services"),
]

def seed_vendor_bills():
    log(f"\n━━━ Step 4: Ingesting {len(VENDOR_BILLS)} vendor bills ━━━")
    for row in VENDOR_BILLS:
        (bill_num, vendor, issue_date, due_date, total, status, payment_date, payment_method, category) = row
        subtotal = round(total / 1.1, 2)
        tax = round(total - subtotal, 2)
        payload = {
            "bill_number": bill_num,
            "vendor_name": vendor,
            "issue_date": issue_date,
            "due_date": due_date,
            "total": total,
            "subtotal": subtotal,
            "tax": tax,
            "currency": "USD",
            "status": status,
            "payment_terms": "Net 30",
            "payment_method": payment_method,
            "line_items": f"[{{'description': '{category}', 'amount': {total}}}]",
            "gl_accounts": "['2000 - Accounts Payable', '6000 - Operating Expenses']",
            "journal_entry_id": f"JE-{bill_num}",
        }
        if payment_date:
            payload["payment_date"] = payment_date
        ingest("vendor_bill_transaction", bill_num, payload)


# ─── Step 5: Customer Payments ─────────────────────────────────────────────────

CUSTOMER_PAYMENTS = [
    ("PAY-C-001", "Apex Manufacturing Co.", "2025-01-28", 24500.00, "INV-2025-001", "bank_transfer"),
    ("PAY-C-002", "BlueSky Logistics",      "2025-02-07", 11880.00, "INV-2025-002", "bank_transfer"),
    ("PAY-C-003", "Crestview Partners",     "2025-02-12", 35700.00, "INV-2025-003", "wire_transfer"),
    ("PAY-C-004", "DataCore Systems",       "2025-02-18", 3564.00,  "INV-2025-004", "credit_card"),
    ("PAY-C-005", "Evergreen Retail",       "2025-02-28", 8900.00,  "INV-2025-005", "bank_transfer"),
    ("PAY-C-006", "FuturePath Consulting",  "2025-03-10", 15200.00, "INV-2025-006", "bank_transfer"),
    ("PAY-C-007", "Harbor Health Systems",  "2025-03-20", 12960.00, "INV-2025-008", "bank_transfer"),
    ("PAY-C-008", "InnovateTech GmbH",      "2025-03-28", 18700.00, "INV-2025-009", "wire_transfer"),
    ("PAY-C-009", "Jupiter Analytics",      "2025-04-12", 2376.00,  "INV-2025-010", "credit_card"),
    ("PAY-C-010", "Keystone Pharma",        "2025-04-28", 53000.00, "INV-2025-011", "wire_transfer"),
    ("PAY-C-011", "LightBridge Media",      "2025-05-03", 8900.00,  "INV-2025-012", "bank_transfer"),
    ("PAY-C-012", "MountainView Capital",   "2025-05-08", 17760.00, "INV-2025-013", "wire_transfer"),
    ("PAY-C-013", "OceanBridge Shipping",   "2025-05-29", 11880.00, "INV-2025-015", "bank_transfer"),
    ("PAY-C-014", "Pinnacle Realty Group",  "2025-06-09", 4752.00,  "INV-2025-016", "credit_card"),
    ("PAY-C-015", "QuantumLeap AI",         "2025-06-17", 39600.00, "INV-2025-017", "wire_transfer"),
    ("PAY-C-016", "RedRock Construction",   "2025-06-28", 8900.00,  "INV-2025-018", "bank_transfer"),
    ("PAY-C-017", "SkyHigh Ventures",       "2025-07-13", 71000.00, "INV-2025-019", "wire_transfer"),
    ("PAY-C-018", "TrueNorth Energy",       "2025-07-23", 12960.00, "INV-2025-020", "bank_transfer"),
    ("PAY-C-019", "Apex Manufacturing Co.", "2025-07-29", 26000.00, "INV-2025-021", "wire_transfer"),
    ("PAY-C-020", "WestCoast Distributors", "2025-09-15", 8000.00,  "INV-2025-026", "bank_transfer"),
]

def seed_customer_payments():
    log(f"\n━━━ Step 5: Ingesting {len(CUSTOMER_PAYMENTS)} customer payments ━━━")
    for (ref, customer, pay_date, amount, invoice_num, method) in CUSTOMER_PAYMENTS:
        ingest("customer_payment", ref, {
            "payment_reference": ref,
            "customer_name": customer,
            "payment_date": pay_date,
            "amount": amount,
            "currency": "USD",
            "invoice_number": invoice_num,
            "bank_account_name": "Chase Business Checking #4821",
            "payment_method": method,
            "journal_entry_id": f"JE-{ref}",
            "status": "completed",
        })


# ─── Step 6: Vendor Payments ───────────────────────────────────────────────────

VENDOR_PAYMENTS = [
    ("PAY-V-001", "Amazon Web Services",  "2025-01-28", 68000.00, "VB-2025-001", "bank_transfer"),
    ("PAY-V-002", "Amazon Web Services",  "2025-02-25", 71200.00, "VB-2025-002", "bank_transfer"),
    ("PAY-V-003", "Amazon Web Services",  "2025-03-28", 73500.00, "VB-2025-003", "bank_transfer"),
    ("PAY-V-004", "HubSpot Inc.",         "2025-01-15",  2400.00, "VB-2025-007", "credit_card"),
    ("PAY-V-005", "HubSpot Inc.",         "2025-02-15",  2400.00, "VB-2025-008", "credit_card"),
    ("PAY-V-006", "Zendesk Inc.",         "2025-01-15",  1800.00, "VB-2025-010", "credit_card"),
    ("PAY-V-007", "GitHub Inc.",          "2025-01-10",   800.00, "VB-2025-012", "credit_card"),
    ("PAY-V-008", "WeWork Austin",        "2025-01-05", 12000.00, "VB-2025-016", "bank_transfer"),
    ("PAY-V-009", "WeWork Austin",        "2025-02-05", 12000.00, "VB-2025-017", "bank_transfer"),
    ("PAY-V-010", "WeWork Austin",        "2025-03-05", 12000.00, "VB-2025-018", "bank_transfer"),
    ("PAY-V-011", "DataDog Inc.",         "2025-03-25",  5200.00, "VB-2025-019", "credit_card"),
    ("PAY-V-012", "Stripe Inc.",          "2025-02-20",  2840.00, "VB-2025-020", "bank_transfer"),
    ("PAY-V-013", "Stripe Inc.",          "2025-03-20",  3120.00, "VB-2025-021", "bank_transfer"),
    ("PAY-V-014", "TechRecruit Partners", "2025-05-10", 18000.00, "VB-2025-023", "bank_transfer"),
    ("PAY-V-015", "LegalEdge LLP",        "2025-05-28",  7500.00, "VB-2025-024", "bank_transfer"),
    ("PAY-V-016", "Salesforce Inc.",      "2025-03-10",  4500.00, "VB-2025-014", "bank_transfer"),
    ("PAY-V-017", "Office Depot",         "2025-02-15",  3200.00, "VB-2025-015", "credit_card"),
    ("PAY-V-018", "Amazon Web Services",  "2025-04-28", 74800.00, "VB-2025-004", "bank_transfer"),
    ("PAY-V-019", "Amazon Web Services",  "2025-05-29", 76500.00, "VB-2025-005", "bank_transfer"),
    ("PAY-V-020", "Amazon Web Services",  "2025-06-27", 79200.00, "VB-2025-006", "bank_transfer"),
]

def seed_vendor_payments():
    log(f"\n━━━ Step 6: Ingesting {len(VENDOR_PAYMENTS)} vendor payments ━━━")
    for (ref, vendor, pay_date, amount, bill_num, method) in VENDOR_PAYMENTS:
        ingest("vendor_payment", ref, {
            "payment_reference": ref,
            "vendor_name": vendor,
            "payment_date": pay_date,
            "amount": amount,
            "currency": "USD",
            "bill_number": bill_num,
            "bank_account_name": "Chase Business Checking #4821",
            "payment_method": method,
            "journal_entry_id": f"JE-{ref}",
        })


# ─── Step 7: Journal Entries ───────────────────────────────────────────────────

JOURNAL_ENTRIES = [
    ("JE-ADJ-001", "2025-01-31", "adjusting", "Month-end accrual for January salaries and benefits",
     "[{'account': '6100 - Salaries', 'amount': 145000}, {'account': '6110 - Benefits', 'amount': 21000}]",
     "[{'account': '2100 - Accrued Liabilities', 'amount': 166000}]"),

    ("JE-ADJ-002", "2025-02-28", "adjusting", "Month-end accrual for February salaries and benefits",
     "[{'account': '6100 - Salaries', 'amount': 145000}, {'account': '6110 - Benefits', 'amount': 21000}]",
     "[{'account': '2100 - Accrued Liabilities', 'amount': 166000}]"),

    ("JE-ADJ-003", "2025-03-31", "adjusting", "Q1 depreciation for server hardware and office equipment",
     "[{'account': '6200 - Depreciation', 'amount': 8400}]",
     "[{'account': '1600 - Accumulated Depreciation', 'amount': 8400}]"),

    ("JE-ADJ-004", "2025-03-31", "adjusting", "Prepaid expense amortization — insurance and SaaS subscriptions",
     "[{'account': '6300 - Insurance Expense', 'amount': 2100}, {'account': '6400 - Software Subscriptions', 'amount': 4200}]",
     "[{'account': '1200 - Prepaid Expenses', 'amount': 6300}]"),

    ("JE-ADJ-005", "2025-06-30", "adjusting", "Q2 accrual for legal consulting retainer — LegalEdge LLP",
     "[{'account': '6700 - Legal Fees', 'amount': 7500}]",
     "[{'account': '2100 - Accrued Liabilities', 'amount': 7500}]"),

    ("JE-ADJ-006", "2025-06-30", "adjusting", "Deferred revenue recognition — Q2 annual subscriptions",
     "[{'account': '2200 - Deferred Revenue', 'amount': 86400}]",
     "[{'account': '4000 - Software Revenue', 'amount': 86400}]"),

    ("JE-ADJ-007", "2025-06-30", "adjusting", "Q2 depreciation — capitalized R&D software development costs",
     "[{'account': '6200 - Depreciation', 'amount': 12600}]",
     "[{'account': '1700 - Accumulated Amortization - R&D', 'amount': 12600}]"),

    ("JE-ADJ-008", "2025-07-31", "adjusting", "July salaries and benefits accrual — headcount 48 FTEs",
     "[{'account': '6100 - Salaries', 'amount': 152000}, {'account': '6110 - Benefits', 'amount': 22000}]",
     "[{'account': '2100 - Accrued Liabilities', 'amount': 174000}]"),

    ("JE-ADJ-009", "2025-09-30", "adjusting", "Q3 depreciation and amortization — all asset classes",
     "[{'account': '6200 - Depreciation', 'amount': 8400}, {'account': '6201 - Amortization', 'amount': 12600}]",
     "[{'account': '1600 - Accumulated Depreciation', 'amount': 8400}, {'account': '1700 - Accumulated Amortization', 'amount': 12600}]"),

    ("JE-MAN-001", "2025-05-15", "manual", "Reclassification of DataDog expense from COGS to R&D overhead",
     "[{'account': '5200 - R&D Overhead', 'amount': 5200}]",
     "[{'account': '5100 - COGS - Infrastructure', 'amount': 5200}]"),

    ("JE-MAN-002", "2025-08-10", "manual", "Write-off of uncollectible receivable — Global Steel Ltd INV-2025-007",
     "[{'account': '6800 - Bad Debt Expense', 'amount': 42000}]",
     "[{'account': '1100 - Accounts Receivable', 'amount': 42000}]"),

    ("JE-MAN-003", "2025-09-01", "manual", "Series A legal and due diligence costs capitalized as deferred financing",
     "[{'account': '1800 - Deferred Financing Costs', 'amount': 35000}]",
     "[{'account': '1010 - Operating Cash', 'amount': 35000}]"),
]

def seed_journal_entries():
    log(f"\n━━━ Step 7: Ingesting {len(JOURNAL_ENTRIES)} journal entries ━━━")
    for (entry_code, entry_date, entry_type, narration, debit_lines, credit_lines) in JOURNAL_ENTRIES:
        ingest("journal_entry", entry_code, {
            "entry_code": entry_code,
            "entry_date": entry_date,
            "entry_type": entry_type,
            "narration": narration,
            "debit_lines": debit_lines,
            "credit_lines": credit_lines,
            "gl_accounts": "['6100', '2100', '4000', '1100', '1600']",
            "posted_by": "accounting-team",
            "reference_doc": entry_code,
        })


# ─── Step 8: Anomaly Flags ─────────────────────────────────────────────────────

ANOMALY_FLAGS = [
    ("ANOM-001", "invoice_transaction", "INV-2025-007", 0.91,
     "Global Steel Ltd invoice $42,000 remains 45+ days overdue. Customer historically pays within 15 days. "
     "Possible cash flow issue at customer. AR aging risk. No response to 3 follow-up emails.",
     42000.00, "Global Steel Ltd."),

    ("ANOM-002", "vendor_bill_transaction", "VB-2025-025", 0.87,
     "Deloitte Advisory bill $22,000 for 'Consulting Services' lacks detailed breakdown. "
     "Vendor engagement not found in approved vendor list. No PO associated. "
     "Amount 3.2x higher than typical consulting bills this quarter.",
     22000.00, "Deloitte Advisory"),

    ("ANOM-003", "vendor_bill_transaction", "VB-2025-006", 0.78,
     "AWS bill in June spiked 16.4% month-over-month from $68,000 to $79,200. "
     "Spike correlates with launch of new analytics module but exceeds projected infrastructure cost by $6,800. "
     "Recommend review of unused compute resources and right-sizing.",
     79200.00, "Amazon Web Services"),

    ("ANOM-004", "invoice_transaction", "INV-2025-026", 0.82,
     "WestCoast Distributors partially paid INV-2025-026 ($8,000 of $13,200). "
     "Customer historically pays in full. Disputed line item for implementation fee. "
     "Collections follow-up required. Remaining balance $5,200 at risk.",
     13200.00, "WestCoast Distributors"),

    ("ANOM-005", "journal_entry", "JE-MAN-002", 0.95,
     "Bad debt write-off of $42,000 for Global Steel Ltd is the single largest write-off in company history. "
     "Represents 2.1% of Q1 revenue. Watch for pattern if other Enterprise customers show similar overdue behavior. "
     "Credit team should review customer concentration risk.",
     42000.00, "Global Steel Ltd."),

    ("ANOM-006", "vendor_payment", "PAY-V-001", 0.73,
     "AWS January payment of $68,000 processed 3 days before invoice due date. "
     "Early payment resulted in no discount capture. Finance policy requires payment on due date to optimize cash flow. "
     "Review payment scheduling automation.",
     68000.00, "Amazon Web Services"),

    ("ANOM-007", "invoice_transaction", "INV-2025-014", 0.80,
     "NexGen Automotive INV-2025-014 $24,500 overdue by 44 days. Second overdue invoice from this customer in 2025. "
     "Customer on payment watch list. Consider requiring upfront payment for next renewal.",
     24500.00, "NexGen Automotive"),
]

def seed_anomaly_flags():
    log(f"\n━━━ Step 8: Ingesting {len(ANOMALY_FLAGS)} anomaly flags ━━━")
    for (anom_id, tx_type, tx_id, score, explanation, amount, counterparty) in ANOMALY_FLAGS:
        ingest("anomaly_flagged_transactions", anom_id, {
            "anomaly_id": anom_id,
            "transaction_type": tx_type,
            "transaction_id": tx_id,
            "anomaly_score": score,
            "feature_explanation": explanation,
            "amount": amount,
            "currency": "USD",
            "counterparty_name": counterparty,
            "gl_accounts": "['1100 - Accounts Receivable', '6800 - Bad Debt']",
            "was_user_confirmed": False,
        })


# ─── Step 9: Quarter Live Reports ─────────────────────────────────────────────

def seed_quarter_reports():
    log("\n━━━ Step 9: Ingesting quarterly live reports ━━━")

    # Q1 2025
    ingest("quarter_live_report", "report-novatech-q1-2025", {
        "org_name": "NovaTech Solutions",
        "quarter": "Q1",
        "fiscal_year": "2025",
        "income_statement": {
            "revenue": 240580,
            "cost_of_goods_sold": 77000,
            "gross_profit": 163580,
            "gross_margin_pct": 68.0,
            "operating_expenses": {
                "salaries_benefits": 498000,
                "cloud_infrastructure": 212700,
                "sales_marketing": 48000,
                "office_rent": 36000,
                "software_subscriptions": 18000,
                "legal_fees": 7500,
                "other": 12400,
            },
            "total_opex": 832600,
            "ebitda": -669020,
            "net_income": -669020,
        },
        "balance_sheet": {
            "current_assets": {
                "cash": 1240000,
                "accounts_receivable": 68000,
                "prepaid_expenses": 38000,
            },
            "non_current_assets": {
                "property_equipment_net": 84000,
                "capitalized_rd": 126000,
            },
            "total_assets": 1556000,
            "current_liabilities": {
                "accounts_payable": 82000,
                "accrued_liabilities": 166000,
                "deferred_revenue": 312000,
            },
            "total_liabilities": 560000,
            "equity": 996000,
        },
        "cash_flow_statement": {
            "operating_cash_flow": -641000,
            "investing_cash_flow": -42000,
            "financing_cash_flow": 0,
            "net_cash_change": -683000,
            "ending_cash_balance": 1240000,
        },
        "kpis": {
            "arr": 4200000,
            "mrr": 350000,
            "gross_margin_pct": 68.0,
            "churn_rate_pct": 1.6,
            "net_revenue_retention_pct": 104,
            "customer_count": 320,
            "avg_contract_value": 13125,
            "cac": 8400,
            "ltv": 54000,
            "ltv_cac_ratio": 6.4,
            "burn_rate_monthly": 310000,
            "runway_months": 4.0,
        },
        "revenue_trends": (
            "Q1 2025 revenue of $240,580 was 12% below Q4 2024 due to seasonality. "
            "Enterprise tier grew 8% while Starter tier declined 3%. "
            "New ARR added: $320,000. Expansion ARR: $48,000. Churned ARR: $26,600. "
            "Net new ARR: $341,400."
        ),
        "expense_trends": (
            "AWS costs increased 8% vs Q4 2024 due to new analytics module launch. "
            "Salary expense stable. Recruitment spend $0 (headcount freeze in Q1). "
            "Legal fees elevated due to Series A preparation. "
            "Operating cost per customer: $2,602."
        ),
        "cash_metrics": {
            "burn_rate": 310000,
            "runway_months": 4.0,
            "cash_conversion_cycle_days": 38,
            "ar_days": 28,
            "ap_days": 32,
        },
        "risk_indicators": (
            "1. Customer concentration: Top 5 customers = 31% of ARR. "
            "2. Global Steel Ltd $42,000 invoice 45+ days overdue — bad debt risk. "
            "3. AWS costs trending up 16% YoY — margin compression risk. "
            "4. Runway only 4 months — Series A raise is critical path. "
            "5. Deferred revenue burn rate accelerating."
        ),
        "operational_metrics": {
            "headcount": 48,
            "revenue_per_employee": 5012,
            "support_tickets_opened": 842,
            "support_resolution_time_hrs": 4.2,
            "uptime_pct": 99.94,
        },
    })

    # Q2 2025
    ingest("quarter_live_report", "report-novatech-q2-2025", {
        "org_name": "NovaTech Solutions",
        "quarter": "Q2",
        "fiscal_year": "2025",
        "income_statement": {
            "revenue": 311200,
            "cost_of_goods_sold": 98000,
            "gross_profit": 213200,
            "gross_margin_pct": 68.5,
            "operating_expenses": {
                "salaries_benefits": 510000,
                "cloud_infrastructure": 230500,
                "sales_marketing": 56000,
                "office_rent": 36000,
                "software_subscriptions": 19200,
                "recruitment_fees": 18000,
                "legal_fees": 14500,
                "consulting": 22000,
                "other": 9800,
            },
            "total_opex": 916000,
            "ebitda": -702800,
            "net_income": -702800,
        },
        "balance_sheet": {
            "current_assets": {
                "cash": 850000,
                "accounts_receivable": 113000,
                "prepaid_expenses": 31000,
            },
            "non_current_assets": {
                "property_equipment_net": 76000,
                "capitalized_rd": 152000,
            },
            "total_assets": 1222000,
            "current_liabilities": {
                "accounts_payable": 91000,
                "accrued_liabilities": 181000,
                "deferred_revenue": 398000,
            },
            "total_liabilities": 670000,
            "equity": 552000,
        },
        "cash_flow_statement": {
            "operating_cash_flow": -680000,
            "investing_cash_flow": -58000,
            "financing_cash_flow": 0,
            "net_cash_change": -738000,
            "ending_cash_balance": 850000,
        },
        "kpis": {
            "arr": 4620000,
            "mrr": 385000,
            "gross_margin_pct": 68.5,
            "churn_rate_pct": 1.4,
            "net_revenue_retention_pct": 108,
            "customer_count": 338,
            "avg_contract_value": 13669,
            "cac": 9800,
            "ltv": 58200,
            "ltv_cac_ratio": 5.9,
            "burn_rate_monthly": 325000,
            "runway_months": 2.6,
        },
        "revenue_trends": (
            "Q2 2025 revenue grew 29.4% quarter-over-quarter to $311,200, driven by 4 new Enterprise wins. "
            "SkyHigh Ventures ($71,000) was the largest single invoice in company history. "
            "Keystone Pharma ($53,000) onboarded. MRR growth: +$35,000 vs Q1. "
            "Professional plan now 52% of revenue as Enterprise mix increases."
        ),
        "expense_trends": (
            "AWS cost increase of 8.4% reflects Q2 customer growth. "
            "Recruitment spend of $18,000 for 2 new enterprise sales hires. "
            "Deloitte consulting $22,000 for Series A readiness audit (overdue, disputed). "
            "G&A ratio improving: 9.1% of revenue vs 12.3% in Q1."
        ),
        "cash_metrics": {
            "burn_rate": 325000,
            "runway_months": 2.6,
            "cash_conversion_cycle_days": 34,
            "ar_days": 26,
            "ap_days": 30,
        },
        "risk_indicators": (
            "CRITICAL: Cash runway reduced to 2.6 months. Series A closing is existential. "
            "Deloitte $22,000 invoice overdue — vendor relationship at risk. "
            "NexGen Automotive $24,500 invoice 44+ days overdue. "
            "WestCoast Distributors partial payment — $5,200 at risk. "
            "AWS cost trajectory: if growth continues at 8% MoM, will exceed $100K/month by Q4."
        ),
        "operational_metrics": {
            "headcount": 50,
            "revenue_per_employee": 6224,
            "support_tickets_opened": 1120,
            "support_resolution_time_hrs": 3.8,
            "uptime_pct": 99.97,
        },
    })

    # Q3 2025
    ingest("quarter_live_report", "report-novatech-q3-2025", {
        "org_name": "NovaTech Solutions",
        "quarter": "Q3",
        "fiscal_year": "2025",
        "income_statement": {
            "revenue": 364400,
            "cost_of_goods_sold": 112000,
            "gross_profit": 252400,
            "gross_margin_pct": 69.3,
            "operating_expenses": {
                "salaries_benefits": 528000,
                "cloud_infrastructure": 243000,
                "sales_marketing": 68000,
                "office_rent": 36000,
                "software_subscriptions": 19200,
                "recruitment_fees": 0,
                "legal_fees": 7500,
                "other": 11300,
            },
            "total_opex": 913000,
            "ebitda": -660600,
            "net_income": -660600,
        },
        "balance_sheet": {
            "current_assets": {
                "cash": 4100000,
                "accounts_receivable": 78000,
                "prepaid_expenses": 28000,
            },
            "non_current_assets": {
                "property_equipment_net": 68000,
                "capitalized_rd": 178000,
            },
            "total_assets": 4452000,
            "current_liabilities": {
                "accounts_payable": 74000,
                "accrued_liabilities": 174000,
                "deferred_revenue": 462000,
            },
            "total_liabilities": 710000,
            "equity": 3742000,
        },
        "cash_flow_statement": {
            "operating_cash_flow": -598000,
            "investing_cash_flow": -44000,
            "financing_cash_flow": 5000000,
            "net_cash_change": 4358000,
            "ending_cash_balance": 4100000,
        },
        "kpis": {
            "arr": 5040000,
            "mrr": 420000,
            "gross_margin_pct": 69.3,
            "churn_rate_pct": 1.1,
            "net_revenue_retention_pct": 112,
            "customer_count": 355,
            "avg_contract_value": 14197,
            "cac": 9200,
            "ltv": 63200,
            "ltv_cac_ratio": 6.9,
            "burn_rate_monthly": 310000,
            "runway_months": 13.2,
        },
        "revenue_trends": (
            "Q3 2025 revenue grew 17.1% QoQ to $364,400. ARR crossed $5M milestone in August. "
            "YieldPath Finance ($53,000) and Zenith Healthcare ($24,500, overdue) were major Enterprise wins. "
            "Vertex Biotech and Unified Networks added to Enterprise roster. "
            "Net Revenue Retention improved to 112% — expansion revenue exceeding churn."
        ),
        "expense_trends": (
            "Cost discipline improved: total OpEx flat vs Q2 despite revenue growth. "
            "AWS grew to $243K in Q3 but rate of increase slowing (5.4% vs 8.4% in Q2). "
            "Bad debt write-off of $42,000 (Global Steel) impacted net income. "
            "Series A financing costs of $35,000 capitalized as deferred financing costs."
        ),
        "cash_metrics": {
            "burn_rate": 310000,
            "runway_months": 13.2,
            "cash_conversion_cycle_days": 31,
            "ar_days": 24,
            "ap_days": 28,
        },
        "risk_indicators": (
            "Positive: Series A of $5M closed September 2025 — runway extended to 13+ months. "
            "Remaining risks: Zenith Healthcare $24,500 overdue. "
            "WestCoast Distributors $5,200 remaining balance disputed. "
            "AWS costs approaching breakeven point — infrastructure optimization needed in Q4. "
            "Headcount plan for 8 new hires in Q4 will increase burn to ~$380K/month."
        ),
        "operational_metrics": {
            "headcount": 50,
            "revenue_per_employee": 7288,
            "support_tickets_opened": 1340,
            "support_resolution_time_hrs": 3.5,
            "uptime_pct": 99.98,
        },
    })


# ─── Step 10: AI Insights (pre-seeded) ─────────────────────────────────────────

def seed_ai_insights():
    log("\n━━━ Step 10: Ingesting pre-seeded AI insights ━━━")

    ingest("ai_insights", "insight-novatech-cost-optimization-001", {
        "content": """
## FINDINGS
NovaTech Solutions' AWS spend grew from $68,000/month in January to $79,200/month in June 2025 — a 16.5% increase
over 6 months. This outpaces revenue growth of 29% for the same period but represents significant absolute dollars.

## REVENUE TRENDS
Revenue grew consistently from Q1 ($240K) through Q3 ($364K), a 51% improvement over 3 quarters.
Enterprise mix is increasing: 4 Enterprise deals in Q2 alone. Professional plan remains the volume leader.

## EXPENSE TRENDS
AWS: +16.5% over H1. Salaries stable at $145K/month through Q1, increasing to $152K in Q3.
Recruitment spend was $18K in Q2 only. Legal fees elevated in Q2 due to Series A.

## CASH FLOW ANALYSIS
Cash position collapsed from $1.24M (Q1) to $850K (Q2) before Series A ($5M) restored runway in Q3.
Operating cash burn: ~$310-325K/month. Post-Series A runway: 13.2 months.

## RISKS
1. AWS cost trajectory: if growth continues at 5-8%/month, may exceed $100K/month by Q1 2026.
2. Customer concentration: Top 5 = 31% ARR.
3. Bad debt: $42K write-off (Global Steel) + $24.5K overdue (Zenith) + $5.2K disputed (WestCoast).
4. Runway consumed in 13 months without additional revenue growth or cost optimization.

## OPPORTUNITIES
1. Right-size AWS: Reserved Instances could save 20-30% (~$16K-24K/month).
2. Enterprise expansion: NRR of 112% shows strong expansion revenue potential.
3. Pricing: Average contract value growing; consider price increase for new Enterprise contracts.
4. Collections: Tighten AR process — 3 overdue invoices totaling $71.7K.

## RECOMMENDATIONS
[PRIORITY: HIGH] — Conduct AWS cost audit. Identify idle/underutilized resources. Switch to Reserved Instances for
baseline workloads. Target: reduce monthly AWS cost by $15K by Q1 2026.

[PRIORITY: HIGH] — Accelerate collections on Zenith Healthcare ($24,500) and WestCoast Distributors ($5,200).
Escalate to executive sponsor relationships. Consider payment plans.

[PRIORITY: MEDIUM] — Implement automated payment reminders at 7, 3, and 1 day before invoice due dates.
Current AR days of 24 can be reduced to 18 days, improving cash flow by ~$40K/month.

[PRIORITY: MEDIUM] — Negotiate Deloitte bill dispute. The $22,000 consulting invoice lacks detailed breakdown.
Request itemized statement and PO retroactive approval.

[PRIORITY: LOW] — Evaluate HubSpot plan optimization. Current usage at 60% of licensed seats.
Downgrading to a lower tier could save $800/month.
""",
        "analysis_type": "cost_optimization",
        "generated_at": "2025-10-01T09:00:00Z",
        "org_slug": ORG_SLUG,
        "query": "How can we reduce costs and optimize spending?",
    })

    ingest("ai_insights", "insight-novatech-risk-assessment-001", {
        "content": """
## FINDINGS
NovaTech Solutions faces a multi-dimensional risk profile entering Q4 2025. While the Series A closing has resolved
the immediate liquidity crisis, structural risks in customer concentration, infrastructure costs, and collections
require systematic management.

## RISKS

### HIGH SEVERITY
1. Customer Concentration Risk: Top 5 customers (Apex Mfg, Crestview Partners, SkyHigh Ventures, Keystone Pharma,
   YieldPath Finance) account for 31% of $5M ARR ($1.55M). Loss of any single customer would require 6+ months to
   replace at current new ARR rates.

2. Infrastructure Cost Inflation: AWS costs at $79.2K/month in June are growing faster than revenue unit economics
   support. At current 8% MoM growth rate, AWS would reach $105K by December 2025, compressing gross margins
   from 69% toward 65%.

### MEDIUM SEVERITY
3. Accounts Receivable Quality: $71,700 in overdue receivables across 3 customers (Global Steel $42K written off,
   Zenith $24.5K overdue, WestCoast $5.2K disputed). Bad debt rate of 1.8% is elevated for a SaaS business.

4. Vendor Dependency: Single-vendor dependency on AWS for 100% of cloud infrastructure. No multi-cloud strategy.
   Outage or price increase would impact operations and costs simultaneously.

5. Series A Burn Rate: At $310K-380K/month burn post-hiring plan, the $5M Series A provides 13-16 months runway.
   Path to Series B or profitability must be established within 10 months.

### LOW SEVERITY
6. Support Scalability: Ticket volume grew 59% from Q1 to Q3 (842 → 1,340) while headcount grew 4%.
   If not addressed, customer satisfaction and NPS will deteriorate.

## RECOMMENDATIONS
[PRIORITY: HIGH] — Develop a customer concentration reduction plan. Target max 8% ARR concentration per customer.
Prioritize new logo acquisition in underrepresented verticals.

[PRIORITY: HIGH] — Create multi-cloud disaster recovery architecture on GCP or Azure.
Negotiate AWS committed use discounts simultaneously.

[PRIORITY: MEDIUM] — Implement credit scoring for new Enterprise customers. Require prepayment or LOC for
customers with less than 2 years operating history.

[PRIORITY: MEDIUM] — Establish AR aging review as a weekly executive KPI. Automate collections workflow.

[PRIORITY: LOW] — Hire 1 additional support engineer in Q4 to prevent support queue degradation.
""",
        "analysis_type": "risk_assessment",
        "generated_at": "2025-10-05T11:00:00Z",
        "org_slug": ORG_SLUG,
        "query": "What are our biggest financial risks?",
    })


# ─── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  Hesbetak.AI — Database Seeder")
    print(f"  Target org:  {ORG_SLUG}")
    print(f"  Server:      {BASE_URL}")
    print("=" * 60)

    create_tenant()
    seed_onboarding()
    seed_invoices()
    seed_vendor_bills()
    seed_customer_payments()
    seed_vendor_payments()
    seed_journal_entries()
    seed_anomaly_flags()
    seed_quarter_reports()
    seed_ai_insights()

    print("\n" + "=" * 60)
    print("  ✅ Seeding complete!")
    print(f"  Tenant:   {ORG_SLUG}")
    print(f"  Records ingested:")
    print(f"    - 1  onboarding questionnaire (7 sections → 7 chunks)")
    print(f"    - {len(INVOICES)} invoice transactions")
    print(f"    - {len(VENDOR_BILLS)} vendor bill transactions")
    print(f"    - {len(CUSTOMER_PAYMENTS)} customer payments")
    print(f"    - {len(VENDOR_PAYMENTS)} vendor payments")
    print(f"    - {len(JOURNAL_ENTRIES)} journal entries")
    print(f"    - {len(ANOMALY_FLAGS)} anomaly flags")
    print(f"    - 3  quarter live reports (Q1/Q2/Q3 2025, 9 sections each → ~27 chunks)")
    print(f"    - 2  AI insights (windowed → multiple chunks each)")
    print("=" * 60)
    print("\nTest your system:")
    print(f"  POST {BASE_URL}/tenants/{ORG_SLUG}/langgraph/run")
    print('  Body: {"userQuery": "What was our revenue in Q2 2025?"}')
    print(f"  POST {BASE_URL}/tenants/{ORG_SLUG}/langgraph/run")
    print('  Body: {"userQuery": "What are our biggest financial risks?"}')
    print(f"  POST {BASE_URL}/tenants/{ORG_SLUG}/langgraph/run")
    print('  Body: {"userQuery": "Generate a quarterly financial report"}')

if __name__ == "__main__":
    main()
