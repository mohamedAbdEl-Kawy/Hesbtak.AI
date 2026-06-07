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
Use when the user is asking for contextual, semantic, relationship-based, or document-based information that may require searching financial documents, transaction descriptions, notes, summaries, analyses, invoices, or quarter reports.

Examples:
- What transactions affected the marketing expense account?
- Show Azure-related expenses.
- Why did cloud spending increase?
- What was discussed about customer concentration risk?
- Find invoices related to consulting services.
- What financial risks were identified in Q1?
- Explain vendor payment patterns.

Source of truth:
Vector search / RAG documents.

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
- Prefer "financialReasoningAgent" when the user is asking for recommendations, analysis, optimization, forecasting, decision support, or report generation.
- Prefer "ragSearchAgent" when the answer requires searching financial documents, summaries, notes, descriptions, or semantic relationships rather than direct aggregation from the database.
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
  const { userQuery } = state;

  try {
    const response = await groqClient.chat.completions.create({
      model: LLM_MODELS.ORCHESTRATOR_AGENT,
      messages: [
        { role: 'system', content: ORCHESTRATOR_SYSTEM_PROMPT },
        { role: 'user', content: `Please classify this query: "${userQuery}"` },
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
