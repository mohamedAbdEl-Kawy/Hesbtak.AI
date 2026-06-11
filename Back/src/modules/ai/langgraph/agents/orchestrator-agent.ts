import { StateType } from '../state/graph-state';
import { LLM_MODELS } from '../config/llm.config';
import Groq from 'groq-sdk';

const ORCHESTRATOR_SYSTEM_PROMPT = `
You are an AI Orchestrator for a financial assistant called Hesbetak.AI.

Your task is to classify the user's request into exactly one of the following intents.

INTENTS

1. "databaseSearchAgent"
Use when the user is requesting exact, structured, factual, or numerical information that should come directly from the accounting database.

Examples:
- What was our revenue last month?
- What were total expenses in Q1?
- What was the last transaction?
- Show all unpaid invoices.
- How many customers were added this year?
- What is the balance of account 4000?
- Which vendor received the largest payment?
- Show customer payments for March.
- How much did we pay Microsoft this year?

Source of truth:
SQL database.

--------------------------------------------------

2. "ragSearchAgent"
Use only when the user is asking about qualitative information contained in organization documents, reports, onboarding answers, policies, OCR text, or approved insights.

Examples:
- What did the audit report say about inventory controls?
- Summarize management's explanation for customer concentration risk.
- What goals were recorded during onboarding?
- What assumptions were documented in the forecast commentary?
- Which policy applies to employee reimbursements?

Source of truth:
Trusted organization documents.

--------------------------------------------------

3. "financialReasoningAgent"
Use when the user is asking for analysis, recommendations, forecasting, optimization, insights, planning, scenario evaluation, executive summaries, or financial reports.

Examples:
- How can we reduce costs?
- Analyze our cash flow.
- What are the biggest financial risks?
- How can we improve profitability?
- Recommend actions to improve collections.
- Why is net income declining?
- Generate a quarterly financial report.
- Create an executive summary.
- Summarize our financial performance.
- forecasting expenses / revenues

Source of truth:
Reasoning over available financial data + report generation.

--------------------------------------------------

4. "other"

Use when:
- The request is conversational.
- The request is unrelated to finance.
- The intent cannot be determined.

Examples:
- Hello
- Who are you?
- Tell me a joke.

--------------------------------------------------

RULES

- Choose exactly one intent.
- Prefer "databaseSearchAgent" whenever an exact number or factual database lookup is requested.
- Use "databaseSearchAgent" for transaction descriptions, invoices, payments, accounts, customers, vendors, and date-filtered financial records.
- Prefer "financialReasoningAgent" when the user is asking for recommendations, analysis, optimization, forecasting, decision support, or report generation.
- Prefer "ragSearchAgent" only when the answer is located in document text or qualitative organization context.
- Set unresolvedIntent=true only if the request is ambiguous and cannot be confidently classified.

Respond ONLY with valid JSON. No markdown, no code fences, no extra text.

{
  "intent": "databaseSearchAgent | ragSearchAgent | financialReasoningAgent | other",
  "unresolvedIntent": boolean
}
`;

/**
 * Orchestrator Agent — classifies the user's intent into one of four routes.
 * Uses a fast, small LLM for low-latency classification.
 */
export async function orchestratorAgentNode(
  state: StateType,
  groqClient: Groq,
): Promise<Partial<StateType>> {
  const { userQuery, conversationHistory } = state;

  try {
    const response = await groqClient.chat.completions.create({
      model: LLM_MODELS.ORCHESTRATOR_AGENT,
      messages: [
        { role: 'system', content: ORCHESTRATOR_SYSTEM_PROMPT },
        {
          role: 'user',
          content:
            `${conversationHistory ? `Recent conversation:\n${conversationHistory}\n\n` : ''}` +
            `Classify this standalone request: "${userQuery}"`,
        },
      ],
      max_tokens: 100,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const parsed = JSON.parse(
      response.choices[0]?.message?.content || '{}',
    ) as { intent?: string; unresolvedIntent?: boolean };

    console.log('Orchestrator classified:', parsed);

    const validIntents = [
      'databaseSearchAgent',
      'ragSearchAgent',
      'financialReasoningAgent',
      'other',
    ] as const;

    const intentValue = validIntents.includes(parsed.intent as any)
      ? (parsed.intent as StateType['intent'])
      : 'other';

    const unresolvedIntent =
      intentValue === 'other' ? true : (parsed.unresolvedIntent ?? false);

    return { intent: intentValue, unresolvedIntent };
  } catch (error) {
    console.error('Orchestrator agent error:', error);
    return { intent: 'other', unresolvedIntent: true };
  }
}
