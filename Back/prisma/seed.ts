import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { DataBaseService } from '../src/database/database.service';
import { TenantService } from '../src/modules/tenant/tenant.service';
import { EmbeddingProviderService } from '../src/modules/ai/embeddings/embedding-provider';
import { EmbeddingsService } from '../src/modules/ai/embeddings/embeddings.service';
import { SourceChunkerService } from '../src/modules/ai/embeddings/source-chunker.service';
import { RagIndexService } from '../src/modules/ai/rag-index.service';

const ORGANIZATION_ID = '7004ba5a-3ae2-4007-9d1e-bcb228f7c518';
const USER_ID = '10000000-0000-4000-8000-000000000001';
const PLAN_ID = '10000000-0000-4000-8000-000000000002';
const SUBSCRIPTION_ID = '10000000-0000-4000-8000-000000000003';
const EMAIL = 'chatbot.test@hesbetak.local';
const PASSWORD = 'ChatbotTest123!';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  const config = new ConfigService(process.env);
  const db = new DataBaseService(config);
  const tenant = new TenantService(db);
  await db.$connect();

  try {
    const schemaName = tenant.schemaNameForOrganization(ORGANIZATION_ID);
    const passwordHash = await bcrypt.hash(PASSWORD, 12);
    const user = await db.user.upsert({
      where: { email: EMAIL },
      create: {
        id: USER_ID,
        fullName: 'Mariam Chatbot Tester',
        email: EMAIL,
        passwordHash,
      },
      update: {
        fullName: 'Mariam Chatbot Tester',
        passwordHash,
        globalRole: 'user',
      },
    });

    await db.plan.upsert({
      where: { id: PLAN_ID },
      create: {
        id: PLAN_ID,
        name: 'Chatbot Test Pro',
        price: 99,
        billingCycle: 'monthly',
        features: { chatbot: true, rag: true, financialAnalysis: true },
      },
      update: {
        name: 'Chatbot Test Pro',
        price: 99,
        features: { chatbot: true, rag: true, financialAnalysis: true },
        isActive: true,
      },
    });
    await db.organization.upsert({
      where: { id: ORGANIZATION_ID },
      create: {
        id: ORGANIZATION_ID,
        name: 'Cairo Consulting Group',
        industry: 'Business Consulting',
        currency: 'USD',
        schemaName,
      },
      update: {
        name: 'Cairo Consulting Group',
        industry: 'Business Consulting',
        currency: 'USD',
        schemaName,
      },
    });
    await db.organizationUser.upsert({
      where: {
        organizationId_userId: {
          organizationId: ORGANIZATION_ID,
          userId: user.id,
        },
      },
      create: {
        organizationId: ORGANIZATION_ID,
        userId: user.id,
        role: 'owner',
        joinedAt: new Date('2026-01-01T09:00:00Z'),
      },
      update: { role: 'owner', isActive: true },
    });
    await db.subscription.upsert({
      where: { id: SUBSCRIPTION_ID },
      create: {
        id: SUBSCRIPTION_ID,
        organizationId: ORGANIZATION_ID,
        planId: PLAN_ID,
        status: 'active',
        currentPeriodStart: new Date('2026-06-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-07-01T00:00:00Z'),
      },
      update: {
        status: 'active',
        currentPeriodStart: new Date('2026-06-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-07-01T00:00:00Z'),
      },
    });

    await tenant.provisionTenantSchema(schemaName);
    await tenant.seedChartOfAccounts(schemaName, 'Business Consulting');
    const schema = tenant.quote(schemaName);
    await seedTenantData(db, schema, user.id);
    const indexed = await indexTenant(db, tenant, schemaName);
    const summary = await seedSummary(db, schema);

    console.log('\nChatbot test company seeded successfully.');
    console.log(`Organization: Cairo Consulting Group`);
    console.log(`Organization ID: ${ORGANIZATION_ID}`);
    console.log(`Tenant schema: ${schemaName}`);
    console.log(`Email: ${EMAIL}`);
    console.log(`Password: ${PASSWORD}`);
    console.log(`RAG sources indexed: ${indexed}`);
    console.log(
      `Data summary: ${summary.vendors} vendors, ${summary.invoices} invoices, ` +
        `${summary.embeddings} embeddings, $${summary.revenue} revenue, ` +
        `$${summary.expenses} expenses, $${summary.cash} cash`,
    );
  } finally {
    await db.$disconnect();
  }
}

async function seedTenantData(
  db: DataBaseService,
  schema: string,
  userId: string,
) {
  if (!/^[0-9a-f-]{36}$/.test(userId)) throw new Error('Unsafe seed user id');

  await db.$executeRawUnsafe(`
    INSERT INTO ${schema}.accounts (code, name, type) VALUES
      ('5200', 'Software and Hosting', 'Expense'),
      ('5300', 'Contractor Costs', 'Expense'),
      ('5400', 'Marketing', 'Expense'),
      ('5500', 'Travel', 'Expense'),
      ('5600', 'Rent and Office', 'Expense')
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name, type = EXCLUDED.type, is_active = true;

    INSERT INTO ${schema}.customers
      (id, name, email, phone, address, payment_terms, currency, created_by)
    VALUES
      ('20000000-0000-4000-8000-000000000001', 'Acme Manufacturing',
       'finance@acme.example', '+1-202-555-0140', 'Washington, DC', 30, 'USD', '${userId}'),
      ('20000000-0000-4000-8000-000000000002', 'Nile Retail Holdings',
       'accounts@nileretail.example', '+20-2-5550-2200', 'New Cairo, Egypt', 15, 'USD', '${userId}')
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, email = EXCLUDED.email, phone = EXCLUDED.phone,
      address = EXCLUDED.address, payment_terms = EXCLUDED.payment_terms,
      currency = EXCLUDED.currency, is_active = true;

    INSERT INTO ${schema}.vendors
      (id, name, email, phone, address, payment_terms, created_by)
    VALUES
      ('30000000-0000-4000-8000-000000000001', 'CloudSphere Hosting',
       'billing@cloudsphere.example', '+1-202-555-0101', 'Business District', 15, '${userId}'),
      ('30000000-0000-4000-8000-000000000002', 'TalentBridge Contractors',
       'ap@talentbridge.example', '+1-202-555-0102', 'Business District', 30, '${userId}'),
      ('30000000-0000-4000-8000-000000000003', 'Downtown Office Supplies',
       'sales@downtownoffice.example', '+1-202-555-0103', 'Business District', 15, '${userId}')
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, email = EXCLUDED.email,
      payment_terms = EXCLUDED.payment_terms, is_active = true;

    INSERT INTO ${schema}.bank_accounts
      (id, name, account_number, bank_name, currency, gl_account_id)
    VALUES
      ('40000000-0000-4000-8000-000000000001', 'Primary Operating Account',
       'TEST-8842', 'Hesbetak Test Bank', 'USD',
       (SELECT id FROM ${schema}.accounts WHERE code = '1000'))
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, bank_name = EXCLUDED.bank_name,
      currency = EXCLUDED.currency, gl_account_id = EXCLUDED.gl_account_id,
      is_active = true;

    INSERT INTO ${schema}.onboarding_responses (id, question_key, answer) VALUES
      ('50000000-0000-4000-8000-000000000001', 'business_model',
       'Management consulting, financial advisory, and digital transformation projects for mid-market companies.'),
      ('50000000-0000-4000-8000-000000000002', 'payment_methods',
       'Customer payments arrive by bank transfer. Vendors are paid by bank transfer and company card.'),
      ('50000000-0000-4000-8000-000000000003', 'main_expenses',
       'Contractors, cloud hosting, software subscriptions, travel, marketing, rent, and office supplies.'),
      ('50000000-0000-4000-8000-000000000004', 'business_goals',
       'Increase consulting gross margin above 65 percent and maintain at least three months of operating cash.')
    ON CONFLICT (id) DO UPDATE SET
      question_key = EXCLUDED.question_key, answer = EXCLUDED.answer;

    DELETE FROM ${schema}.journal_lines
    WHERE journal_entry_id::text LIKE ANY (ARRAY[
      '60000000-%', '61000000-%', '62000000-%',
      '63000000-%', '64000000-%', '65000000-%'
    ]);

    INSERT INTO ${schema}.journal_entries
      (id, date, description, status, reference_type, reference_id, created_by)
    VALUES
      ('60000000-0000-4000-8000-000000000001', '2026-01-02', 'Owner capital deposited', 'posted', 'capital', '${ORGANIZATION_ID}', '${userId}'),
      ('61000000-0000-4000-8000-000000000001', '2026-01-10', 'Invoice SEED-INV-2026-001', 'posted', 'invoice', '70000000-0000-4000-8000-000000000001', '${userId}'),
      ('61000000-0000-4000-8000-000000000002', '2026-03-05', 'Invoice SEED-INV-2026-002', 'posted', 'invoice', '70000000-0000-4000-8000-000000000002', '${userId}'),
      ('61000000-0000-4000-8000-000000000003', '2026-05-12', 'Invoice SEED-INV-2026-003', 'posted', 'invoice', '70000000-0000-4000-8000-000000000003', '${userId}'),
      ('61000000-0000-4000-8000-000000000004', '2026-06-03', 'Invoice SEED-INV-2026-004', 'posted', 'invoice', '70000000-0000-4000-8000-000000000004', '${userId}'),
      ('62000000-0000-4000-8000-000000000001', '2026-02-02', 'Customer payment SEED-REC-001', 'posted', 'customer_payment', '71000000-0000-4000-8000-000000000001', '${userId}'),
      ('62000000-0000-4000-8000-000000000002', '2026-03-18', 'Customer payment SEED-REC-002', 'posted', 'customer_payment', '71000000-0000-4000-8000-000000000002', '${userId}'),
      ('62000000-0000-4000-8000-000000000003', '2026-06-01', 'Customer payment SEED-REC-003', 'posted', 'customer_payment', '71000000-0000-4000-8000-000000000003', '${userId}'),
      ('63000000-0000-4000-8000-000000000001', '2026-02-01', 'Cloud hosting vendor bill', 'posted', 'vendor_bill', '80000000-0000-4000-8000-000000000001', '${userId}'),
      ('63000000-0000-4000-8000-000000000002', '2026-04-15', 'Contractor services vendor bill', 'posted', 'vendor_bill', '80000000-0000-4000-8000-000000000002', '${userId}'),
      ('63000000-0000-4000-8000-000000000003', '2026-06-02', 'Office rent vendor bill', 'posted', 'vendor_bill', '80000000-0000-4000-8000-000000000003', '${userId}'),
      ('64000000-0000-4000-8000-000000000001', '2026-02-12', 'Vendor payment SEED-PAY-001', 'posted', 'vendor_payment', '81000000-0000-4000-8000-000000000001', '${userId}'),
      ('64000000-0000-4000-8000-000000000002', '2026-05-10', 'Vendor payment SEED-PAY-002', 'posted', 'vendor_payment', '81000000-0000-4000-8000-000000000002', '${userId}'),
      ('65000000-0000-4000-8000-000000000001', '2026-01-20', 'Industry conference sponsorship', 'posted', 'expense', '90000000-0000-4000-8000-000000000001', '${userId}'),
      ('65000000-0000-4000-8000-000000000002', '2026-03-22', 'Client workshop travel', 'posted', 'expense', '90000000-0000-4000-8000-000000000002', '${userId}'),
      ('65000000-0000-4000-8000-000000000003', '2026-05-05', 'Software subscriptions', 'posted', 'expense', '90000000-0000-4000-8000-000000000003', '${userId}'),
      ('65000000-0000-4000-8000-000000000004', '2026-06-05', 'Workshop office supplies', 'posted', 'expense', '90000000-0000-4000-8000-000000000004', '${userId}')
    ON CONFLICT (id) DO UPDATE SET
      date = EXCLUDED.date, description = EXCLUDED.description,
      status = 'posted', reference_type = EXCLUDED.reference_type,
      reference_id = EXCLUDED.reference_id;

    INSERT INTO ${schema}.journal_lines
      (journal_entry_id, account_id, debit, credit, description)
    SELECT entry_id, a.id, debit, credit, description
    FROM (VALUES
      ('60000000-0000-4000-8000-000000000001'::uuid, '1000', 50000::numeric, 0::numeric, 'Opening cash'),
      ('60000000-0000-4000-8000-000000000001'::uuid, '3000', 0::numeric, 50000::numeric, 'Owner equity'),
      ('61000000-0000-4000-8000-000000000001'::uuid, '1100', 12000::numeric, 0::numeric, 'Receivable'),
      ('61000000-0000-4000-8000-000000000001'::uuid, '4000', 0::numeric, 12000::numeric, 'Consulting revenue'),
      ('61000000-0000-4000-8000-000000000002'::uuid, '1100', 18500::numeric, 0::numeric, 'Receivable'),
      ('61000000-0000-4000-8000-000000000002'::uuid, '4000', 0::numeric, 18500::numeric, 'Consulting revenue'),
      ('61000000-0000-4000-8000-000000000003'::uuid, '1100', 24000::numeric, 0::numeric, 'Receivable'),
      ('61000000-0000-4000-8000-000000000003'::uuid, '4000', 0::numeric, 24000::numeric, 'Consulting revenue'),
      ('61000000-0000-4000-8000-000000000004'::uuid, '1100', 30000::numeric, 0::numeric, 'Receivable'),
      ('61000000-0000-4000-8000-000000000004'::uuid, '4000', 0::numeric, 30000::numeric, 'Consulting revenue'),
      ('62000000-0000-4000-8000-000000000001'::uuid, '1000', 12000::numeric, 0::numeric, 'Cash received'),
      ('62000000-0000-4000-8000-000000000001'::uuid, '1100', 0::numeric, 12000::numeric, 'Receivable settled'),
      ('62000000-0000-4000-8000-000000000002'::uuid, '1000', 18500::numeric, 0::numeric, 'Cash received'),
      ('62000000-0000-4000-8000-000000000002'::uuid, '1100', 0::numeric, 18500::numeric, 'Receivable settled'),
      ('62000000-0000-4000-8000-000000000003'::uuid, '1000', 10000::numeric, 0::numeric, 'Cash received'),
      ('62000000-0000-4000-8000-000000000003'::uuid, '1100', 0::numeric, 10000::numeric, 'Receivable settled'),
      ('63000000-0000-4000-8000-000000000001'::uuid, '5200', 4200::numeric, 0::numeric, 'Cloud hosting'),
      ('63000000-0000-4000-8000-000000000001'::uuid, '2000', 0::numeric, 4200::numeric, 'Payable'),
      ('63000000-0000-4000-8000-000000000002'::uuid, '5300', 8500::numeric, 0::numeric, 'Contractors'),
      ('63000000-0000-4000-8000-000000000002'::uuid, '2000', 0::numeric, 8500::numeric, 'Payable'),
      ('63000000-0000-4000-8000-000000000003'::uuid, '5600', 3500::numeric, 0::numeric, 'Office rent'),
      ('63000000-0000-4000-8000-000000000003'::uuid, '2000', 0::numeric, 3500::numeric, 'Payable'),
      ('64000000-0000-4000-8000-000000000001'::uuid, '2000', 4200::numeric, 0::numeric, 'Payable settled'),
      ('64000000-0000-4000-8000-000000000001'::uuid, '1000', 0::numeric, 4200::numeric, 'Cash paid'),
      ('64000000-0000-4000-8000-000000000002'::uuid, '2000', 4000::numeric, 0::numeric, 'Payable settled'),
      ('64000000-0000-4000-8000-000000000002'::uuid, '1000', 0::numeric, 4000::numeric, 'Cash paid'),
      ('65000000-0000-4000-8000-000000000001'::uuid, '5400', 1800::numeric, 0::numeric, 'Marketing'),
      ('65000000-0000-4000-8000-000000000001'::uuid, '1000', 0::numeric, 1800::numeric, 'Cash paid'),
      ('65000000-0000-4000-8000-000000000002'::uuid, '5500', 2200::numeric, 0::numeric, 'Travel'),
      ('65000000-0000-4000-8000-000000000002'::uuid, '1000', 0::numeric, 2200::numeric, 'Cash paid'),
      ('65000000-0000-4000-8000-000000000003'::uuid, '5200', 950::numeric, 0::numeric, 'Software'),
      ('65000000-0000-4000-8000-000000000003'::uuid, '1000', 0::numeric, 950::numeric, 'Cash paid'),
      ('65000000-0000-4000-8000-000000000004'::uuid, '5100', 600::numeric, 0::numeric, 'Office supplies'),
      ('65000000-0000-4000-8000-000000000004'::uuid, '1000', 0::numeric, 600::numeric, 'Cash paid')
    ) AS seeded(entry_id, code, debit, credit, description)
    JOIN ${schema}.accounts a ON a.code = seeded.code;

    INSERT INTO ${schema}.invoices
      (id, invoice_number, customer_id, issue_date, due_date, subtotal,
       tax_amount, total, status, journal_entry_id, created_by)
    VALUES
      ('70000000-0000-4000-8000-000000000001', 'SEED-INV-2026-001', '20000000-0000-4000-8000-000000000001', '2026-01-10', '2026-02-09', 12000, 0, 12000, 'paid', '61000000-0000-4000-8000-000000000001', '${userId}'),
      ('70000000-0000-4000-8000-000000000002', 'SEED-INV-2026-002', '20000000-0000-4000-8000-000000000002', '2026-03-05', '2026-03-20', 18500, 0, 18500, 'paid', '61000000-0000-4000-8000-000000000002', '${userId}'),
      ('70000000-0000-4000-8000-000000000003', 'SEED-INV-2026-003', '20000000-0000-4000-8000-000000000001', '2026-05-12', '2026-06-11', 24000, 0, 24000, 'partial', '61000000-0000-4000-8000-000000000003', '${userId}'),
      ('70000000-0000-4000-8000-000000000004', 'SEED-INV-2026-004', '20000000-0000-4000-8000-000000000002', '2026-06-03', '2026-06-18', 30000, 0, 30000, 'unpaid', '61000000-0000-4000-8000-000000000004', '${userId}')
    ON CONFLICT (invoice_number) DO UPDATE SET
      customer_id = EXCLUDED.customer_id, issue_date = EXCLUDED.issue_date,
      due_date = EXCLUDED.due_date, subtotal = EXCLUDED.subtotal,
      tax_amount = EXCLUDED.tax_amount, total = EXCLUDED.total,
      status = EXCLUDED.status, journal_entry_id = EXCLUDED.journal_entry_id;

    DELETE FROM ${schema}.invoice_lines
    WHERE invoice_id::text LIKE '70000000-%';
    INSERT INTO ${schema}.invoice_lines
      (invoice_id, line_number, description, quantity, unit_price,
       line_subtotal, tax_amount, line_total, revenue_account_id)
    VALUES
      ('70000000-0000-4000-8000-000000000001', 1, 'Operational efficiency assessment and executive workshop', 1, 12000, 12000, 0, 12000, (SELECT id FROM ${schema}.accounts WHERE code='4000')),
      ('70000000-0000-4000-8000-000000000002', 1, 'Retail finance transformation phase one', 1, 18500, 18500, 0, 18500, (SELECT id FROM ${schema}.accounts WHERE code='4000')),
      ('70000000-0000-4000-8000-000000000003', 1, 'Supply chain analytics implementation', 1, 24000, 24000, 0, 24000, (SELECT id FROM ${schema}.accounts WHERE code='4000')),
      ('70000000-0000-4000-8000-000000000004', 1, 'Financial planning and KPI dashboard advisory', 1, 30000, 30000, 0, 30000, (SELECT id FROM ${schema}.accounts WHERE code='4000'));

    INSERT INTO ${schema}.customer_payments
      (id, customer_id, invoice_id, amount, payment_method, bank_account_id,
       payment_date, reference, journal_entry_id, notes, created_by)
    VALUES
      ('71000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 12000, 'bank_transfer', '40000000-0000-4000-8000-000000000001', '2026-02-02', 'SEED-REC-001', '62000000-0000-4000-8000-000000000001', 'Full payment', '${userId}'),
      ('71000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', 18500, 'bank_transfer', '40000000-0000-4000-8000-000000000001', '2026-03-18', 'SEED-REC-002', '62000000-0000-4000-8000-000000000002', 'Full payment', '${userId}'),
      ('71000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000003', 10000, 'bank_transfer', '40000000-0000-4000-8000-000000000001', '2026-06-01', 'SEED-REC-003', '62000000-0000-4000-8000-000000000003', 'Partial payment', '${userId}')
    ON CONFLICT (id) DO UPDATE SET
      amount = EXCLUDED.amount, payment_date = EXCLUDED.payment_date,
      reference = EXCLUDED.reference, journal_entry_id = EXCLUDED.journal_entry_id;

    INSERT INTO ${schema}.vendor_bills
      (id, bill_number, vendor_id, issue_date, due_date, subtotal,
       tax_amount, total, status, journal_entry_id, created_by)
    VALUES
      ('80000000-0000-4000-8000-000000000001', 'SEED-BILL-2026-001', '30000000-0000-4000-8000-000000000001', '2026-02-01', '2026-02-16', 4200, 0, 4200, 'paid', '63000000-0000-4000-8000-000000000001', '${userId}'),
      ('80000000-0000-4000-8000-000000000002', 'SEED-BILL-2026-002', '30000000-0000-4000-8000-000000000002', '2026-04-15', '2026-05-15', 8500, 0, 8500, 'partial', '63000000-0000-4000-8000-000000000002', '${userId}'),
      ('80000000-0000-4000-8000-000000000003', 'SEED-BILL-2026-003', '30000000-0000-4000-8000-000000000003', '2026-06-02', '2026-06-17', 3500, 0, 3500, 'received', '63000000-0000-4000-8000-000000000003', '${userId}')
    ON CONFLICT (bill_number) DO UPDATE SET
      vendor_id = EXCLUDED.vendor_id, issue_date = EXCLUDED.issue_date,
      due_date = EXCLUDED.due_date, subtotal = EXCLUDED.subtotal,
      total = EXCLUDED.total, status = EXCLUDED.status,
      journal_entry_id = EXCLUDED.journal_entry_id;

    DELETE FROM ${schema}.vendor_bill_lines
    WHERE vendor_bill_id::text LIKE '80000000-%';
    INSERT INTO ${schema}.vendor_bill_lines
      (vendor_bill_id, line_number, description, quantity, unit_cost,
       line_subtotal, tax_amount, line_total, expense_account_id)
    VALUES
      ('80000000-0000-4000-8000-000000000001', 1, 'Annual cloud hosting and data warehouse capacity', 1, 4200, 4200, 0, 4200, (SELECT id FROM ${schema}.accounts WHERE code='5200')),
      ('80000000-0000-4000-8000-000000000002', 1, 'Specialist data engineering contractor services', 1, 8500, 8500, 0, 8500, (SELECT id FROM ${schema}.accounts WHERE code='5300')),
      ('80000000-0000-4000-8000-000000000003', 1, 'June office rent and meeting room services', 1, 3500, 3500, 0, 3500, (SELECT id FROM ${schema}.accounts WHERE code='5600'));

    INSERT INTO ${schema}.vendor_payments
      (id, vendor_bill_id, vendor_id, amount, payment_method, bank_account_id,
       payment_date, reference, journal_entry_id, notes, created_by)
    VALUES
      ('81000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 4200, 'bank_transfer', '40000000-0000-4000-8000-000000000001', '2026-02-12', 'SEED-PAY-001', '64000000-0000-4000-8000-000000000001', 'Full payment', '${userId}'),
      ('81000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 4000, 'bank_transfer', '40000000-0000-4000-8000-000000000001', '2026-05-10', 'SEED-PAY-002', '64000000-0000-4000-8000-000000000002', 'Partial payment', '${userId}')
    ON CONFLICT (id) DO UPDATE SET
      amount = EXCLUDED.amount, payment_date = EXCLUDED.payment_date,
      reference = EXCLUDED.reference, journal_entry_id = EXCLUDED.journal_entry_id;

    INSERT INTO ${schema}.expenses
      (id, expense_number, expense_date, category, description, vendor_id,
       amount, tax_amount, total, expense_account_id, payment_method,
       bank_account_id, journal_entry_id, created_by)
    VALUES
      ('90000000-0000-4000-8000-000000000001', 'SEED-EXP-001', '2026-01-20', 'Marketing', 'Industry conference sponsorship', '30000000-0000-4000-8000-000000000003', 1800, 0, 1800, (SELECT id FROM ${schema}.accounts WHERE code='5400'), 'company_card', '40000000-0000-4000-8000-000000000001', '65000000-0000-4000-8000-000000000001', '${userId}'),
      ('90000000-0000-4000-8000-000000000002', 'SEED-EXP-002', '2026-03-22', 'Travel', 'Client workshop travel and accommodation', '30000000-0000-4000-8000-000000000002', 2200, 0, 2200, (SELECT id FROM ${schema}.accounts WHERE code='5500'), 'company_card', '40000000-0000-4000-8000-000000000001', '65000000-0000-4000-8000-000000000002', '${userId}'),
      ('90000000-0000-4000-8000-000000000003', 'SEED-EXP-003', '2026-05-05', 'Software', 'Analytics and collaboration software subscriptions', '30000000-0000-4000-8000-000000000001', 950, 0, 950, (SELECT id FROM ${schema}.accounts WHERE code='5200'), 'company_card', '40000000-0000-4000-8000-000000000001', '65000000-0000-4000-8000-000000000003', '${userId}'),
      ('90000000-0000-4000-8000-000000000004', 'SEED-EXP-004', '2026-06-05', 'Office Supplies', 'Printer supplies and workshop materials', '30000000-0000-4000-8000-000000000003', 600, 0, 600, (SELECT id FROM ${schema}.accounts WHERE code='5100'), 'company_card', '40000000-0000-4000-8000-000000000001', '65000000-0000-4000-8000-000000000004', '${userId}')
    ON CONFLICT (expense_number) DO UPDATE SET
      expense_date = EXCLUDED.expense_date, category = EXCLUDED.category,
      description = EXCLUDED.description, vendor_id = EXCLUDED.vendor_id,
      amount = EXCLUDED.amount, total = EXCLUDED.total,
      expense_account_id = EXCLUDED.expense_account_id,
      journal_entry_id = EXCLUDED.journal_entry_id;

    INSERT INTO ${schema}.forecasts
      (id, forecast_month, predicted_revenue, predicted_expense,
       predicted_cashflow, model_version, confidence_low, confidence_high)
    VALUES
      ('a0000000-0000-4000-8000-000000000001', '2026-07-01',
       34000, 12500, 21500, 'seed-baseline-v1', 18000, 25000)
    ON CONFLICT (id) DO UPDATE SET
      predicted_revenue = EXCLUDED.predicted_revenue,
      predicted_expense = EXCLUDED.predicted_expense,
      predicted_cashflow = EXCLUDED.predicted_cashflow;

    INSERT INTO ${schema}.alerts
      (id, type, severity, title, message, entity_type, entity_id)
    VALUES
      ('a1000000-0000-4000-8000-000000000001', 'receivable', 'warning',
       'Large unpaid invoice',
       'SEED-INV-2026-004 for $30,000 is due on June 18, 2026.',
       'invoice', '70000000-0000-4000-8000-000000000004')
    ON CONFLICT (id) DO UPDATE SET
      severity = EXCLUDED.severity, title = EXCLUDED.title,
      message = EXCLUDED.message, is_read = false;

    INSERT INTO ${schema}.suggestions (id, type, title, description, status)
    VALUES
      ('a2000000-0000-4000-8000-000000000001', 'cashflow',
       'Follow up on outstanding receivables',
       'Collect the $30,000 Nile Retail invoice and the remaining $14,000 Acme balance.',
       'active')
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title, description = EXCLUDED.description, status = 'active';
  `);
}

async function indexTenant(
  db: DataBaseService,
  tenant: TenantService,
  schemaName: string,
) {
  const config = new ConfigService(process.env);
  const provider = new EmbeddingProviderService(config);
  const embeddings = new EmbeddingsService(
    db,
    tenant,
    provider,
    new SourceChunkerService(),
  );
  const rag = new RagIndexService(db, tenant, embeddings);
  const result = await rag.reindexTenant({
    organizationId: ORGANIZATION_ID,
    schemaName,
    role: 'owner',
  });
  return result.indexed;
}

async function seedSummary(db: DataBaseService, schema: string) {
  const rows = await db.$queryRawUnsafe<
    Array<{
      vendors: number;
      invoices: number;
      embeddings: number;
      revenue: string;
      expenses: string;
      cash: string;
    }>
  >(
    `SELECT
      (SELECT COUNT(*)::int FROM ${schema}.vendors) AS vendors,
      (SELECT COUNT(*)::int FROM ${schema}.invoices) AS invoices,
      (SELECT COUNT(*)::int FROM ${schema}.embeddings WHERE is_deleted = false) AS embeddings,
      (SELECT COALESCE(SUM(jl.credit - jl.debit), 0)
       FROM ${schema}.journal_lines jl
       JOIN ${schema}.accounts a ON a.id = jl.account_id
       WHERE a.type = 'Revenue') AS revenue,
      (SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
       FROM ${schema}.journal_lines jl
       JOIN ${schema}.accounts a ON a.id = jl.account_id
       WHERE a.type = 'Expense') AS expenses,
      (SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
       FROM ${schema}.journal_lines jl
       JOIN ${schema}.accounts a ON a.id = jl.account_id
       WHERE a.code = '1000') AS cash`,
  );
  return rows[0];
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exitCode = 1;
});
