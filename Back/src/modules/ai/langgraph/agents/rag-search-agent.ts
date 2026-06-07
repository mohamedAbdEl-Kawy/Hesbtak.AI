import { StateType } from '../state/graph-state';
import { LLM_MODELS } from '../config/llm.config';
import { RetrievalService } from '../../retrieval/retrieval.service';
import { tier2SystemPrompt } from '../langgraph-prompts';
import Groq from 'groq-sdk';

const PRESENT_SOURCE_TYPES = [
  'invoice_transaction',
  'vendor_bill_transaction',
  'customer_payment',
  'vendor_payment',
  'journal_entry',
  'anomaly_flag',
  'anomaly_flagged_transactions',
  'onboarding_questionnaire',
  'quarter_live_report',
  'ai_insights',
  'account',
  'customer',
  'vendor',
  'expense',
] as const;

type SourceType = (typeof PRESENT_SOURCE_TYPES)[number];

async function decideSourceTypes(
  userQuery: string,
  groqClient: Groq,
): Promise<SourceType[]> {
  const response = await groqClient.chat.completions.create({
    model: LLM_MODELS.CHATTING_AGENT,
    messages: [
      {
        role: 'system',
        content: `
You are a RAG source-type router.

Choose the best source types for the user query.

Available source types:
${PRESENT_SOURCE_TYPES.join('\n')}

Return ONLY a JSON array.

Examples:
["invoice_transaction"]
["invoice_transaction","customer_payment"]
["vendor_bill_transaction","vendor_payment"]
["quarter_live_report","ai_insights"]

Rules:
- Return ONLY valid source types from the list.
- Return between 1 and 4 source types.
- If the query needs multiple data types, return multiple source types.
- Do NOT return "all".
- Do NOT explain.
        `.trim(),
      },
      {
        role: 'user',
        content: userQuery,
      },
    ],
    temperature: 0,
    max_tokens: 100,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? '[]';

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return ['ai_insights'];
    }

    const validTypes = parsed.filter((type): type is SourceType =>
      PRESENT_SOURCE_TYPES.includes(type),
    );

    return validTypes.length > 0 ? validTypes : ['ai_insights'];
  } catch {
    return ['ai_insights'];
  }
}

export async function ragSearchAgentNode(
  state: StateType,
  groqClient: Groq,
  retrievalService: RetrievalService,
): Promise<Partial<StateType>> {
  const { userQuery, orgSlug, tenantContext } = state;

  console.log('RAG Search Agent: query:', userQuery);

  let retrievedContext = '';

  try {
    const selectedSourceTypes = await decideSourceTypes(userQuery, groqClient);

    console.log('Selected source types:', selectedSourceTypes);

    const retrievals = await Promise.all(
      selectedSourceTypes.map(async (sourceType) => {
        try {
          const { context, results } =
            await retrievalService.retrieveBySourceType(
              tenantContext,
              sourceType,
              userQuery,
              8,
              0.05,
            );

          console.log(
            `RAG Search Agent: retrieved ${results.length} chunks from ${sourceType}`,
          );

          return {
            sourceType,
            context,
            resultsCount: results.length,
          };
        } catch (error) {
          console.error(`RAG retrieval failed for ${sourceType}:`, error);

          return {
            sourceType,
            context: '',
            resultsCount: 0,
          };
        }
      }),
    );

    retrievedContext = retrievals
      .filter((item) => item.context && item.context.trim().length > 0)
      .map(
        (item) =>
          `[SOURCE TYPE: ${item.sourceType}]\n${item.context}`,
      )
      .join('\n\n');

    if (!retrievedContext.trim()) {
      retrievedContext = `
[RETRIEVED CONTEXT]

No relevant documents found.

[USER QUESTION]

${userQuery}
      `.trim();
    }
  } catch (error) {
    console.error('RAG retrieval failed:', error);

    retrievedContext = `
[RETRIEVED CONTEXT]

No relevant documents found.

[USER QUESTION]

${userQuery}
    `.trim();
  }

  try {
    const response = await groqClient.chat.completions.create({
      model: LLM_MODELS.CHATTING_AGENT,
      messages: [
        {
          role: 'system',
          content: tier2SystemPrompt(orgSlug),
        },
        {
          role: 'user',
          content: `
[RETRIEVED CONTEXT]

${retrievedContext}

[USER QUESTION]

${userQuery}
          `.trim(),
        },
      ],
      max_tokens: 800,
      temperature: 0.2,
    });

    const answer = response.choices[0]?.message?.content?.trim() ?? '';

    return {
      agentOutput:
        answer ||
        'No relevant information found in the knowledge base for your query.',
      unresolvedIntent: false,
    };
  } catch (error) {
    console.error('RAG Search Agent LLM synthesis error:', error);

    return {
      agentOutput:
        'I found some relevant context in our knowledge base but encountered an error generating a response. Please try again.',
      unresolvedIntent: false,
    };
  }
}
