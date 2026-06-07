import { StateType } from '../state/graph-state';
import { LLM_MODELS } from '../config/llm.config';
import Groq from 'groq-sdk';

/**
 * Report Generation Agent
 *
 * Transforms the Financial Reasoning Agent's structured reasoning output into
 * a professional Markdown report.
 *
 * Can only be invoked by the Financial Reasoning Agent (never directly by the
 * Orchestrator).
 *
 * Supported report types (inferred automatically):
 *  - Financial Analysis Report
 *  - Cost Optimization Report
 *  - Cash Flow Analysis Report
 *  - Budget Planning Report
 *  - Executive Summary
 *  - Quarterly Review Report
 *  - Risk Assessment Report
 *
 * Report structure:
 *  1. Executive Summary
 *  2. Key Findings
 *  3. KPI Analysis
 *  4. Risks
 *  5. Opportunities
 *  6. Recommendations
 *  7. Supporting Evidence
 */
export async function reportGenerationAgentNode(
  state: StateType,
  groqClient: Groq,
): Promise<Partial<StateType>> {
  const {
    orgSlug,
    organizationName,
    reasoningOutput,
    userQuery,
    reportType,
  } = state;

  if (!reasoningOutput) {
    console.warn('Report Generation Agent: no reasoningOutput in state — skipping');
    return {
      reportMarkdown: '',
      agentOutput: 'No reasoning output available to generate a report.',
    };
  }

  console.log('Report Generation Agent: generating report for org:', orgSlug);

  const resolvedReportType = reportType ?? inferReportType(userQuery ?? '');

  const REPORT_SYSTEM_PROMPT = `You are a senior FP&A financial report writer for ${organizationName}.

You have received structured financial analysis. Your task is to transform it into a professional, readable Markdown report titled: "${resolvedReportType}".

# Core Instructions
- Use only data present in the analysis input.
- Treat verified live database figures as available financial data.
- Never say financial data is unavailable if the analysis contains ledger, revenue, expense, invoice, bill, receivable, payable, cash flow, or monthly figures.
- Do not invent numbers, KPIs, trends, recommendations, risks, or evidence.
- If a KPI cannot be calculated from the provided data, write "Not available from provided data".
- Use professional financial language.
- Keep the report concise, clear, and executive-friendly.
- Use Markdown formatting throughout.
- Cite source data or reasoning evidence whenever possible.

# Section Flexibility
You do NOT need to include every section.
Choose only the sections that fit the report type and available data.

Possible sections:
- Executive Summary
- Key Findings
- KPI Dashboard
- KPI Analysis
- Financial Performance Analysis
- Cash Flow Analysis
- Cost Drivers
- Budget Variance Analysis
- Risk Assessment
- Opportunities
- Recommendations
- Supporting Evidence

# Required Header Format

# ${resolvedReportType}

**Organization:** ${organizationName}  
**Generated:** ${new Date().toISOString().split('T')[0]}  
**Report Type:** ${resolvedReportType}  

---

# Report-Type Guidance

## Financial Analysis Report
Focus on revenue, expenses, profitability, margins, balance movements, and financial health.

## Cost Optimization Report
Focus on cost drivers, unnecessary spending, savings opportunities, and prioritized actions.

## Cash Flow Analysis Report
Focus on cash inflows, outflows, receivables, payables, working capital, and liquidity risks.

## Budget Planning Report
Focus on budget assumptions, expected spending, allocation priorities, and planning recommendations.

## Executive Summary
Keep it brief. Use fewer sections. Prioritize business conclusions and action points.

## Quarterly Review Report
Focus on quarter performance, trend movement, KPI comparison, risks, and next-quarter priorities.

## Risk Assessment Report
Focus on risk severity, financial exposure, root causes, evidence, and mitigation steps.

## Profitability Analysis Report
Focus on gross profit, operating profit, margins, revenue quality, expense pressure, and profitability drivers.

## Forecasting Report
Focus on forecast assumptions, projected trends, scenario risks, and planning recommendations.

# KPI Dashboard Rules

When KPI data exists, include a visually clean KPI dashboard table.

Use this exact table format:

## KPI Dashboard

| KPI | Current Value | Previous / Baseline | Trend | Status | Commentary |
|---|---:|---:|:---:|:---:|---|
| Revenue | ... | ... | ↑ / ↓ / → | Good / Watch / Risk | Short interpretation |
| Expenses | ... | ... | ↑ / ↓ / → | Good / Watch / Risk | Short interpretation |
| Gross Margin | ... | ... | ↑ / ↓ / → | Good / Watch / Risk | Short interpretation |
| Operating Profit | ... | ... | ↑ / ↓ / → | Good / Watch / Risk | Short interpretation |
| Cash Flow Impact | ... | ... | ↑ / ↓ / → | Good / Watch / Risk | Short interpretation |

Rules for KPI Dashboard:
- Only include KPIs supported by the analysis input.
- Do not include fake KPI rows.
- Use currency formatting where appropriate.
- Use percentages for margin ratios.
- Trend meaning:
  - ↑ means improvement
  - ↓ means deterioration
  - → means stable or no clear change
- Status meaning:
  - Good = healthy or improving
  - Watch = needs monitoring
  - Risk = negative or concerning
- Commentary must explain the business meaning, not just repeat the number.

# KPI Analysis Rules

After the KPI Dashboard, add a short KPI Analysis section only if useful.

Use bullet points like:
- **Revenue:** Explain movement, reason, and business impact.
- **Expenses:** Explain cost behavior and concern level.
- **Margin:** Explain profitability quality.
- **Cash Flow:** Explain liquidity or working capital impact.

# Risk Formatting

For risks, use this format:

## Risk Assessment

- **[Severity: HIGH] Risk Name**  
  Explanation of the risk.  
  **Evidence:** Specific figure or finding from the analysis.  
  **Impact:** Business impact.

- **[Severity: MEDIUM] Risk Name**  
  ...

# Recommendation Formatting

For recommendations, use this format:

## Recommendations

1. **[PRIORITY: HIGH] Recommendation title**  
   **Action:** What should be done.  
   **Reason:** Why this matters.  
   **Expected Impact:** Expected financial or operational benefit.

2. **[PRIORITY: MEDIUM] Recommendation title**  
   ...

# Supporting Evidence

Include this section only if the analysis input has concrete figures, source references, or extracted data.

## Supporting Evidence

| Evidence | Source / Context |
|---|---|
| ... | ... |

# Closing Footer

---
*This report was generated by Hesbetak.AI Financial Assistant. All data is based on the provided verified financial records and analysis context.*`;

  try {
    const response = await groqClient.chat.completions.create({
      model: LLM_MODELS.REPORT_GENERATION_AGENT, // llama-3.3-70b-versatile
      messages: [
        { role: 'system', content: REPORT_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Please generate the ${resolvedReportType} based on the following analysis:\n\n${reasoningOutput}`,
        },
      ],
      max_tokens: 3000,
      temperature: 0.2,
    });

    const reportMarkdown = response.choices[0]?.message?.content?.trim() ?? '';

    console.log('Report Generation Agent: report generated, length:', reportMarkdown.length);

    // Provide a brief agentOutput summary for the chatting agent to reference
    const agentOutput = reportMarkdown
      ? `A ${resolvedReportType} has been generated for ${organizationName}. The report covers key findings, KPI analysis, identified risks, opportunities, and prioritized recommendations.`
      : 'Report generation encountered an issue. Please try again.';

    return {
      reportMarkdown,
      agentOutput,
    };
  } catch (error) {
    console.error('Report Generation Agent error:', error);
    return {
      reportMarkdown: '',
      agentOutput: 'Report generation encountered an error. The financial analysis is available in the response.',
    };
  }
}

/**
 * Infers the report title/type from the user's query.
 */
function inferReportType(query: string): string {
  const q = query.toLowerCase();
  if (q.includes('cost') || q.includes('optim')) return 'Cost Optimization Report';
  if (q.includes('cash') || q.includes('liquidity')) return 'Cash Flow Analysis Report';
  if (q.includes('risk') || q.includes('exposure')) return 'Risk Assessment Report';
  if (q.includes('profit') || q.includes('margin')) return 'Profitability Analysis Report';
  if (q.includes('budget') || q.includes('plan')) return 'Budget Planning Report';
  if (q.includes('forecast')) return "Forecasting Report"
  if (q.includes('executive') || q.includes('overview')) return 'Executive Summary';
  if (q.includes('quarter') || q.includes('quarterly')) return 'Quarterly Review Report';
  return 'Financial Analysis Report';
}
