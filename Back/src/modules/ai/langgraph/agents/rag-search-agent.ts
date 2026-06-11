import Groq from 'groq-sdk';
import { RetrievalService } from '../../retrieval/retrieval.service';
import { LLM_MODELS } from '../config/llm.config';
import { tier2SystemPrompt } from '../langgraph-prompts';
import { StateType } from '../state/graph-state';

export async function ragSearchAgentNode(
  state: StateType,
  groqClient: Groq,
  retrievalService: RetrievalService,
): Promise<Partial<StateType>> {
  const { userQuery, organizationName, tenantContext } = state;

  try {
    const { context, results } = await retrievalService.retrieve(
      tenantContext,
      userQuery,
      8,
      0.0,
    );

    if (results.length === 0) {
      return {
        agentOutput:
          'I could not find relevant information in the organization documents.',
        unresolvedIntent: false,
      };
    }

    const response = await groqClient.chat.completions.create({
      model: LLM_MODELS.CHATTING_AGENT,
      messages: [
        {
          role: 'system',
          content: tier2SystemPrompt(organizationName),
        },
        {
          role: 'user',
          content: `${context}\n\nAnswer the user question using only the document context. Cite supporting items as [SOURCE 1], [SOURCE 2], and so on.`,
        },
      ],
      max_tokens: 800,
      temperature: 0.2,
    });

    return {
      agentOutput:
        response.choices[0]?.message?.content?.trim() ||
        'I could not produce an answer from the available documents.',
      ragContext: context,
      unresolvedIntent: false,
    };
  } catch (error) {
    console.error('RAG Search Agent error:', error);
    return {
      agentOutput:
        'I could not search the organization documents right now. Please try again.',
      unresolvedIntent: false,
    };
  }
}
