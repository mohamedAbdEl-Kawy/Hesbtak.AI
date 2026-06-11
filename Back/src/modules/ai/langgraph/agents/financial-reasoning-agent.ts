import Groq from 'groq-sdk';
import { FinancialContextService } from '../../financial-context.service';
import { RetrievalService } from '../../retrieval/retrieval.service';
import { LLM_MODELS } from '../config/llm.config';
import { analysisAgentPrompt } from '../langgraph-prompts';
import { reportProfileByTitle } from '../report-profile';
import { StateType } from '../state/graph-state';

export async function financialReasoningAgentNode(
  state: StateType,
  groqClient: Groq,
  retrievalService: RetrievalService,
  financialContextService: FinancialContextService,
): Promise<Partial<StateType>> {
  const {
    userQuery,
    tenantContext,
    organizationName,
    financialDatabaseContext,
  } = state;
  const reportProfile = reportProfileByTitle(state.reportType);

  const liveFinancialContext =
    financialDatabaseContext ??
    JSON.stringify(
      await financialContextService.build(tenantContext),
      (_key: string, value: unknown): unknown =>
        typeof value === 'bigint' ? Number(value) : value,
    );

  let documentContext = '[DOCUMENT CONTEXT]\nNo relevant documents found.';
  try {
    const retrieval = await retrievalService.retrieve(
      tenantContext,
      `${userQuery}\nRelevant context for ${reportProfile.focus}`,
      6,
      0.55,
    );
    if (retrieval.results.length > 0) {
      documentContext = retrieval.context;
    }
  } catch (error) {
    console.warn('Financial reasoning document retrieval failed:', error);
  }

  const aggregatedContext = [
    `[VERIFIED SQL FINANCIAL DATA]\n${liveFinancialContext}`,
    documentContext,
  ].join('\n\n---\n\n');

  const systemPrompt = `${analysisAgentPrompt(organizationName)}

This analysis will become a "${reportProfile.title}".
Primary focus: ${reportProfile.focus}.
Prefer these sections when supported by evidence:
${reportProfile.sections.map((section) => `- ${section}`).join('\n')}

GROUNDING CONTRACT:
- [VERIFIED SQL FINANCIAL DATA] is the only authority for numbers, totals, balances, counts, rankings, and period comparisons.
- [DOCUMENT CONTEXT] is only for qualitative context such as goals, explanations, assumptions, policies, risks, and prior approved decisions.
- Cite document claims with their [SOURCE N] marker.
- Never calculate totals from document chunks.
- If the SQL context does not support a numerical claim, state that it is unavailable.
- If documents conflict with SQL data, use SQL for financial facts and disclose the conflict.
- Recommendations must identify the SQL fact or document source that supports them.
- Do not invent missing information.`;

  let reasoningOutput: string;
  try {
    const response = await groqClient.chat.completions.create({
      model: LLM_MODELS.FINANCIAL_REASONING_AGENT,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `User request: "${userQuery}"\n\n${aggregatedContext}`,
        },
      ],
      max_tokens: 3000,
      temperature: 0.2,
    });
    reasoningOutput = response.choices[0]?.message?.content?.trim() ?? '';
  } catch (error) {
    console.error('Financial Reasoning Agent error:', error);
    reasoningOutput =
      'Financial analysis could not be completed due to a processing error. Please try again.';
  }

  return {
    ragContext: documentContext,
    reasoningOutput,
    agentOutput: reasoningOutput,
    reportType: reportProfile.title,
    unresolvedIntent: false,
  };
}
