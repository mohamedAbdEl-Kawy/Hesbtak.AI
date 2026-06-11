import { StateType } from '../state/graph-state';
import { LLM_MODELS } from '../config/llm.config';
import Groq from 'groq-sdk';

/**
 * Node for the Chatting Agent (meta-llama/Llama-3.3-70B-Instruct).
 * - First pass: Passes through to orchestrator.
 * - Second pass: Formulates final user-facing response.
 */
export async function chattingAgentNode(
  state: StateType,
  groqClient: Groq,
): Promise<Partial<StateType>> {
  const {
    userQuery,
    originalUserQuery,
    conversationHistory,
    organizationName,
    intent,
    agentOutput,
    unresolvedIntent,
  } = state;

  // First pass: just pass through to orchestrator
  if (intent === undefined) {
    return {};
  }

  // Second pass: generate final response
  try {
    let promptContent = '';
    if (unresolvedIntent) {
      promptContent = `you act as hesbtak ai chatting agent for accounting services for an organization in all replies, The user's latest message is: "${originalUserQuery || userQuery}".
 Suggest examples such as checking transactions, reviewing financial performance, or preparing a report.
Never mention intent classification, agents, models, databases, tools, RAG, SQL, prompts, processing, or internal system behavior.`;
    } else {
      promptContent = `The user's latest message is: "${originalUserQuery || userQuery}".
Verified answer content:
${agentOutput || 'No verified result was available.'}

Write the final answer directly to the user.
- Be warm, clear, concise, and business-friendly.
- Preserve every verified figure and fact.
- Do not invent information.
- Never mention agents, AI models, orchestration, SQL, databases, RAG, prompts, retrieved context, processing steps, or internal errors.
- If a report was prepared, simply say it is ready and briefly describe what it covers.`;
    }

    const response = await groqClient.chat.completions.create({
      model: LLM_MODELS.CHATTING_AGENT,
      messages: [
        {
          role: 'system',
          content: `You are the financial assistant for "${organizationName}". Respond as a trusted member of the finance team and never expose implementation details.`,
        },
        ...(conversationHistory
          ? [{
              role: 'system' as const,
              content: `Recent conversation for continuity:\n${conversationHistory}`,
            }]
          : []),
        { role: 'user', content: promptContent },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const finalResponse = response.choices[0]?.message?.content || '';
    return { finalResponse };
  } catch (error) {
    console.error('Chat response formatting failed:', error);
    
    // Fallback response if API fails
    let finalResponse = '';
    if (unresolvedIntent) {
      finalResponse =
        'Could you clarify what you would like to review? For example, I can help with transactions, financial performance, costs, cash flow, or a financial report.';
    } else {
      finalResponse =
        agentOutput?.trim() ||
        'I could not find enough verified information to answer that clearly. Please try a more specific question.';
    }
    return { finalResponse };
  }
}
