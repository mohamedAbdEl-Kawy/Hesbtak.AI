import { StateType } from '../state/graph-state';
import { LLM_MODELS } from '../config/llm.config';
import { RetrievalService } from '../../retrieval/retrieval.service';
import { EmbeddingsService } from '../../embeddings/embeddings.service';
import { analysisAgentPrompt } from '../langgraph-prompts';
import Groq from 'groq-sdk';
import { FinancialContextService } from '../../financial-context.service';

/**
 * Financial Reasoning Agent
 *
 * Performs advanced financial analysis in three phases:
 *
 *  Phase 1 — Context Retrieval (6 targeted RAG calls)
 *    1. Current quarter invoice transactions
 *    2. Previous quarter invoice transactions
 *    3. Historical AI insights & recommendations
 *    4. Onboarding questionnaire (business identity & context)
 *    5. Current quarter live financial report
 *    6. Previous quarter live financial report
 *
 *  Phase 2 — LLM Reasoning
 *    Structured analysis: revenue/expense/cash trends, customer/vendor health,
 *    risks, opportunities, recommendations — all grounded in retrieved context.
 *
 *  Phase 3 — Insight Storage
 *    Stores the reasoning output back into the RAG system as ai_insights,
 *    enabling institutional knowledge to compound over time.
 */
export async function financialReasoningAgentNode(
  state: StateType,
  groqClient: Groq,
  retrievalService: RetrievalService,
  embeddingsService: EmbeddingsService,
  financialContextService: FinancialContextService,
): Promise<Partial<StateType>> {
  const {
    userQuery,
    orgSlug,
    tenantContext,
    organizationName,
    financialDatabaseContext,
  } = state;

  console.log('Financial Reasoning Agent: starting analysis for org:', orgSlug);

  // ── Phase 1: Parallel Context Retrieval ───────────────────────────────────

  const [
    currentInvoices,
    prevInvoices,
    aiInsights,
    onboarding,
    currentReport,
    prevReport,
  ] = await Promise.allSettled([
    retrievalService.retrieveBySourceType(
      tenantContext,
      'invoice_transaction',
      'current quarter revenue invoices sales customers',
      10,
      0.0,
    ),
    retrievalService.retrieveBySourceType(
      tenantContext,
      'invoice_transaction',
      'previous quarter revenue invoices historical comparison',
      8,
      0.0,
    ),
    retrievalService.retrieveBySourceType(
      tenantContext,
      'ai_insights',
      'financial analysis recommendations risks opportunities cost optimization',
      6,
      0.0,
    ),
    retrievalService.retrieveBySourceType(
      tenantContext,
      'onboarding_questionnaire',
      'business context industry profile currency operating environment',
      4,
      0.0,
    ),
    retrievalService.retrieveBySourceType(
      tenantContext,
      'quarter_live_report',
      'current quarter income statement balance sheet cash flow KPIs performance',
      6,
      0.0,
    ),
    retrievalService.retrieveBySourceType(
      tenantContext,
      'quarter_live_report',
      'previous quarter financial report performance comparison baseline',
      6,
      0.0,
    ),
  ]);

  // Helper to safely extract context from settled promises
  const safeContext = (
    result: PromiseSettledResult<{ results: any[]; context: string }>,
    label: string,
  ): string => {
    if (result.status === 'fulfilled') {
      const count = result.value.results.length;
      if (count === 0) return `[${label}]\nNo data available.\n`;
      return `[${label} — ${count} chunk(s)]\n${result.value.context}\n`;
    }
    console.warn(`RAG retrieval failed for ${label}:`, (result as PromiseRejectedResult).reason);
    return `[${label}]\nRetrieval failed.\n`;
  };

  const liveFinancialContext =
    financialDatabaseContext ??
    JSON.stringify(
      await financialContextService.build(tenantContext),
      (_key, value) => (typeof value === 'bigint' ? Number(value) : value),
    );
  const aggregatedContext = [
    `[VERIFIED LIVE DATABASE FINANCIALS]\n${liveFinancialContext}`,
    safeContext(currentInvoices, 'CURRENT QUARTER INVOICES'),
    safeContext(prevInvoices, 'PREVIOUS QUARTER INVOICES'),
    safeContext(aiInsights, 'HISTORICAL AI INSIGHTS'),
    safeContext(onboarding, 'ORGANIZATION CONTEXT'),
    safeContext(currentReport, 'CURRENT QUARTER LIVE REPORT'),
    safeContext(prevReport, 'PREVIOUS QUARTER LIVE REPORT'),
  ].join('\n---\n\n');
  console.log(currentInvoices)
  console.log('Financial Reasoning Agent: context assembled, starting LLM reasoning');

  // ── Phase 2: LLM Reasoning ────────────────────────────────────────────────

  const REASONING_SYSTEM_PROMPT = `${analysisAgentPrompt(organizationName)}

You must produce a structured financial analysis with the following sections:

## FINDINGS
Concrete observations about revenue, expenses, cash flow, customer health, and vendor patterns.

## REVENUE TRENDS if needed
Quarter-over-quarter revenue comparison. Highlight growth drivers or declines.

## EXPENSE TRENDS if needed
Key expense categories. Flag unusual or growing cost centers.

## CASH FLOW ANALYSIS if needed
Cash inflows vs outflows. Liquidity position and burn rate if applicable.

## RISKS if needed
Operational, financial, and strategic risks with supporting evidence.

## OPPORTUNITIES if needed
Actionable growth or cost-saving opportunities.

## RECOMMENDATIONS
Concrete, prioritized recommendations grounded in the retrieved data.
Format as: [PRIORITY: HIGH/MEDIUM/LOW] — Recommendation text.

## SUPPORTING EVIDENCE
Quote specific data points from the retrieved context that support your analysis.

IMPORTANT: If a section cannot be completed due to insufficient data, say so explicitly.
The [VERIFIED LIVE DATABASE FINANCIALS] section is authoritative financial
data. Use its ledger totals, receivables, payables, monthly values, document
counts, and expense categories. Do not claim financial data is unavailable
when that section contains values, including zero values.
Do NOT invent data. All claims must trace to the retrieved context.`;

  let reasoningOutput = '';

  try {
    const response = await groqClient.chat.completions.create({
      model: LLM_MODELS.FINANCIAL_REASONING_AGENT, // llama-3.3-70b-versatile
      messages: [
        { role: 'system', content: REASONING_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `User request: "${userQuery}"\n\nRetrieved Financial Context:\n\n${aggregatedContext}`,
        },
      ],
      max_tokens: 3000,
      temperature: 0.2,
    });

    reasoningOutput = response.choices[0]?.message?.content?.trim() ?? '';
    console.log('Financial Reasoning Agent: reasoning complete, output length:', reasoningOutput.length);
  } catch (error) {
    console.error('Financial Reasoning Agent LLM error:', error);
    reasoningOutput =
      'Financial analysis could not be completed due to a processing error. Please try again.';
  }

  // ── Phase 3: Store insights back into RAG ─────────────────────────────────

  if (reasoningOutput && !reasoningOutput.includes('could not be completed')) {
    try {
      const insightId = `insight-${orgSlug}-${Date.now()}`;
      await embeddingsService.ingestSource(tenantContext, {
        sourceType: 'ai_insights',
        sourceId: insightId,
        payload: {
          content: reasoningOutput,
          analysis_type: inferAnalysisType(userQuery),
          generated_at: new Date().toISOString(),
          org_slug: orgSlug,
          query: userQuery,
        },
      });
      console.log('Financial Reasoning Agent: insights stored to RAG as', insightId);
    } catch (storeError) {
      // Non-fatal: log and continue — storing insights should not block the response
      console.warn('Financial Reasoning Agent: failed to store insights to RAG:', storeError);
    }
  }

  return {
    ragContext: aggregatedContext,
    reasoningOutput,
    agentOutput: reasoningOutput,
    unresolvedIntent: false,
  };
}

/**
 * Infers the type of financial analysis from the user's query keywords.
 */
function inferAnalysisType(query: string): string {
  const q = query.toLowerCase();
  if (q.includes('cost') || q.includes('optim') || q.includes('reduc')) return 'cost_optimization';
  if (q.includes('cash') || q.includes('liquidity') || q.includes('burn')) return 'cash_flow_analysis';
  if (q.includes('risk') || q.includes('exposure') || q.includes('threat')) return 'risk_assessment';
  if (q.includes('profit') || q.includes('margin') || q.includes('income')) return 'profitability_analysis';
  if (q.includes('budget') || q.includes('plan')) return 'budget_planning';
  if (q.includes('forecast')) return 'forecasting_analysis';
  if (q.includes('report') || q.includes('quarter') || q.includes('summary')) return 'quarterly_review';
  if (q.includes('executive') || q.includes('overview')) return 'executive_summary';
  return 'financial_analysis';
}
