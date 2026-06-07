import { Injectable, BadRequestException } from '@nestjs/common';
import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { PrismaService } from '../../prisma/prisma.service';
import { StateType } from '../state/graph-state';
import { LLM_MODELS } from '../config/llm.config';
import Groq from 'groq-sdk';
import { qualifyTenantTables, TENANT_SQL_TABLES } from './tenant-sql';

const SqlAgentState = Annotation.Root({
  userQuery: Annotation<string>(),
  orgSlug: Annotation<string>(),

  availableTables: Annotation<string | undefined>(),
  schemaInfo: Annotation<string | undefined>(),
  generatedSql: Annotation<string | undefined>(),
  checkedSql: Annotation<string | undefined>(),
  queryResult: Annotation<string | undefined>(),

  agentOutput: Annotation<string | undefined>(),
  finalResponse: Annotation<string | undefined>(),
});

@Injectable()
export class DatabaseSearchAgentGraph {
  constructor(private readonly prisma: PrismaService) {}

  private quoteSchema(orgSlug: string): string {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(orgSlug)) {
      throw new BadRequestException('Invalid org schema');
    }

    return `"${orgSlug}"`;
  }

  private listTables(): string {
    return TENANT_SQL_TABLES.join(', ');
  }

  private getSchemaInfo(orgSlug: string): string {
    const schema = this.quoteSchema(orgSlug);

    return `
${schema}.invoices(
  id uuid,
  invoice_number varchar,
  customer_id uuid,
  issue_date date,
  due_date date,
  subtotal decimal,
  tax_amount decimal,
  total decimal,
  status varchar,
  journal_entry_id uuid,
  created_by uuid,
  created_at timestamp
)

${schema}.customers(
  id uuid,
  name varchar,
  email varchar,
  phone varchar,
  address text,
  payment_terms int,
  currency varchar,
  is_active boolean,
  created_at timestamp,
  created_by uuid
)

${schema}.vendors(
  id uuid,
  name varchar,
  email varchar,
  phone varchar,
  address text,
  payment_terms int,
  is_active boolean,
  created_at timestamp,
  created_by uuid
)

${schema}.vendor_bills(
  id uuid,
  bill_number varchar,
  vendor_id uuid,
  issue_date date,
  due_date date,
  subtotal decimal,
  tax_amount decimal,
  total decimal,
  status varchar,
  journal_entry_id uuid,
  created_by uuid,
  created_at timestamp
)

${schema}.customer_payments(
  id uuid,
  customer_id uuid,
  invoice_id uuid,
  amount decimal,
  payment_method varchar,
  bank_account_id uuid,
  payment_date date,
  reference varchar,
  journal_entry_id uuid,
  notes text,
  created_by uuid,
  created_at timestamp
)

${schema}.vendor_payments(
  id uuid,
  vendor_bill_id uuid,
  vendor_id uuid,
  amount decimal,
  payment_method varchar,
  bank_account_id uuid,
  payment_date date,
  reference varchar,
  journal_entry_id uuid,
  notes text,
  created_by uuid,
  created_at timestamp
)

${schema}.accounts(
  id uuid,
  parent_id uuid,
  code varchar,
  name varchar,
  type varchar,
  is_leaf boolean,
  level int,
  is_active boolean,
  created_at timestamp
)

${schema}.journal_entries(
  id uuid,
  date date,
  description text,
  status varchar,
  reference_type varchar,
  reference_id uuid,
  created_by uuid,
  created_at timestamp
)

${schema}.journal_lines(
  id uuid,
  journal_entry_id uuid,
  account_id uuid,
  debit decimal,
  credit decimal,
  description text
)

${schema}.bank_accounts(
  id uuid,
  name varchar,
  account_number varchar,
  bank_name varchar,
  currency varchar,
  gl_account_id uuid,
  is_active boolean,
  created_at timestamp
)

${schema}.forecasts(
  id uuid,
  forecast_month date,
  predicted_revenue decimal,
  predicted_expense decimal,
  predicted_cashflow decimal,
  model_version varchar,
  confidence_low decimal,
  confidence_high decimal,
  created_at timestamp
)

${schema}.alerts(
  id uuid,
  type varchar,
  severity varchar,
  title varchar,
  message text,
  entity_type varchar,
  entity_id uuid,
  is_read boolean,
  created_at timestamp
)
`;
  }

  private async callGroq(
    groqClient: Groq,
    systemPrompt: string,
    userPrompt: string,
    maxTokens = 700,
  ): Promise<string> {
    const response = await groqClient.chat.completions.create({
      model: LLM_MODELS.CHATTING_AGENT,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
      max_tokens: maxTokens,
    });

    return response.choices[0]?.message?.content?.trim() ?? '';
  }

  private extractSql(content: string): string {
    return content
      .replace(/```sql/gi, '')
      .replace(/```/g, '')
      .trim();
  }

  private validateSql(sql: string, schemaName?: string): void {
    const normalized = sql.trim().toLowerCase();

    if (!normalized.startsWith('select')) {
      throw new BadRequestException('Only SELECT queries are allowed.');
    }

    const blocked = [
      'insert',
      'update',
      'delete',
      'drop',
      'alter',
      'truncate',
      'create',
      'grant',
      'revoke',
      'copy',
      'call',
      'execute',
    ];

    for (const word of blocked) {
      if (new RegExp(`\\b${word}\\b`, 'i').test(sql)) {
        throw new BadRequestException(`Unsafe SQL keyword: ${word}`);
      }
    }

    const statements = sql.split(';').filter((s) => s.trim().length > 0);

    if (statements.length > 1) {
      throw new BadRequestException('Multiple SQL statements are not allowed.');
    }
    if (schemaName) {
      const referencedSchemas = Array.from(
        sql.matchAll(
          /\b(?:FROM|JOIN)\s+(?:"([a-zA-Z_][a-zA-Z0-9_]*)"|([a-zA-Z_][a-zA-Z0-9_]*))\s*\./gi,
        ),
        (match) => match[1] ?? match[2],
      );
      if (referencedSchemas.some((schema) => schema !== schemaName)) {
        throw new BadRequestException('Cross-tenant SQL is not allowed.');
      }
    }
  }

  build(groqClient: Groq) {
    const listTables = async () => {
      return {
        availableTables: this.listTables(),
      };
    };

    const callGetSchema = async (state: typeof SqlAgentState.State) => {
      return {
        schemaInfo: this.getSchemaInfo(state.orgSlug),
      };
    };

    const getSchema = async (state: typeof SqlAgentState.State) => {
      return {
        schemaInfo: state.schemaInfo,
      };
    };

    const generateQuery = async (state: typeof SqlAgentState.State) => {
      if (state.queryResult) {
        const answer = await this.callGroq(
          groqClient,
          `
You are a financial database assistant.

Answer the user's question using only the SQL result.
Do not invent data.
Be concise.
`,
          `
User question:
${state.userQuery}

SQL used:
${state.checkedSql}

SQL result:
${state.queryResult}
`,
          400,
        );

        return {
          agentOutput: answer,
          finalResponse: answer,
        };
      }

      const sql = await this.callGroq(
        groqClient,
        `
You are a PostgreSQL expert for an accounting SaaS.

Generate ONE safe PostgreSQL SELECT query only.

Rules:
- Return SQL only.
- No markdown.
- No explanation.
- Only SELECT queries are allowed.
- Do not use INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE.
- Use schema-qualified table names exactly as provided.
- Never select all columns.
- For non-aggregate queries, add LIMIT 10.
- For revenue, use invoices.total and issue_date.
- For cash inflow, use customer_payments.amount and payment_date.
- For cash outflow, use vendor_payments.amount and payment_date.
- For expenses, use journal_lines joined with accounts where accounts.type = 'EXPENSE'.
- Account balance is SUM(debit - credit).

Available tables:
${state.availableTables}

Schema:
${state.schemaInfo}
`,
        `
User question:
${state.userQuery}
`,
      );

      return {
        generatedSql: this.extractSql(sql),
      };
    };

    const checkQuery = async (state: typeof SqlAgentState.State) => {
      const checkedSql = await this.callGroq(
        groqClient,
        `
You are a PostgreSQL query checker.

Check the SQL for:
- unsafe statements
- missing schema qualification
- wrong joins
- missing LIMIT for non-aggregate queries
- incorrect accounting logic
- invalid PostgreSQL syntax

Required tenant schema:
${this.quoteSchema(state.orgSlug)}

Every accounting table after FROM or JOIN must use that exact tenant schema.
For example: FROM ${this.quoteSchema(state.orgSlug)}."vendors"

If it is correct, return the same SQL.
If it is wrong, return the corrected SQL.

Return SQL only.
No markdown.
No explanation.
`,
        `
User question:
${state.userQuery}

SQL:
${state.generatedSql}
`,
      );

      const sql = qualifyTenantTables(
        this.extractSql(checkedSql),
        state.orgSlug,
      );
      this.validateSql(sql, state.orgSlug);

      return {
        checkedSql: sql,
      };
    };

    const runQuery = async (state: typeof SqlAgentState.State) => {
      const sql = state.checkedSql;

      if (!sql) {
        throw new BadRequestException('No SQL query to execute.');
      }

      this.validateSql(sql, state.orgSlug);

      try {
        console.log('sql running --------------------------------------- ' + sql)
        const rows = await this.prisma.$queryRawUnsafe(sql);
        console.log("rows ---------------------"  + rows)

        return {
          queryResult: JSON.stringify(rows, null, 2),
        };
      } catch (error: any) {
        return {
          queryResult: `SQL_ERROR: ${error.message}`,
        };
      }
    };

    const shouldContinue = (state: typeof SqlAgentState.State) => {
      if (state.finalResponse) {
        return END;
      }

      return 'check_query';
    };

    return new StateGraph(SqlAgentState)
      .addNode('list_tables', listTables)
      .addNode('call_get_schema', callGetSchema)
      .addNode('get_schema', getSchema)
      .addNode('generate_query', generateQuery)
      .addNode('check_query', checkQuery)
      .addNode('run_query', runQuery)
      .addEdge(START, 'list_tables')
      .addEdge('list_tables', 'call_get_schema')
      .addEdge('call_get_schema', 'get_schema')
      .addEdge('get_schema', 'generate_query')
      .addConditionalEdges('generate_query', shouldContinue, {
        check_query: 'check_query',
        [END]: END,
      })
      .addEdge('check_query', 'run_query')
      .addEdge('run_query', 'generate_query')
      .compile();
  }

  async invoke(
    state: StateType,
    groqClient: Groq,
  ): Promise<Partial<StateType>> {
    const graph = this.build(groqClient);

    const result = await graph.invoke({
      userQuery: state.userQuery,
      orgSlug: state.orgSlug,
    });

    return {
      agentOutput: result.agentOutput,
      finalResponse: result.finalResponse,
      unresolvedIntent: false,
    };
  }
}
