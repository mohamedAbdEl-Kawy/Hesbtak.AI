import { InferenceClient } from '@huggingface/inference';
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
    orgSlug,
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
      promptContent = `I received a query: "${userQuery}".
Our AI orchestrator could not identify the intent of this query. 
Please respond to the user politely explaining that you couldn't identify their intent and ask them to clarify if they want to:
- Search the database for transaction history (deterministic or indeterministic data)
- Perform financial analysis, AI insights, or cost optimization
- Generate a financial report.
Keep your response professional and helpful.`;
    } else {
      promptContent = `The user asked: "${userQuery}".
A specialized agent processed this query and returned this output: "${agentOutput}".
Please translate and format this agent output into a friendly, professional response . Do not invent any facts not present in the agent output, but present it beautifully. dont view any unnesccary response to the user if you dont have specific data dont state like dear [user]`;
    }

    const response = await groqClient.chat.completions.create({
      model: LLM_MODELS.CHATTING_AGENT,
      messages: [
        { role: 'system', content: `You are Hesbetak.AI, a premium financial assistant chatting for the organization "${organizationName}".` },
        { role: 'user', content: promptContent },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const finalResponse = response.choices[0]?.message?.content || '';
    return { finalResponse };
  } catch (error) {
    console.error('Error calling deepseek chatting agent:', error);
    
    // Fallback response if API fails
    let finalResponse = '';
    if (unresolvedIntent) {
      finalResponse = `Hello. I am the financial assistant for ${organizationName}. I couldn't identify the intent of your query "${userQuery}". Could you please clarify if you are asking about transaction history (database search), cost optimization (financial reasoning), or compiling a report?`;
    } else {
      finalResponse = `Hello. I am the financial assistant for ${organizationName}. Based on your query "${userQuery}", the specialized agent completed the task: ${agentOutput}. Let me know if you need any additional details!`;
    }
    return { finalResponse };
  }
}
