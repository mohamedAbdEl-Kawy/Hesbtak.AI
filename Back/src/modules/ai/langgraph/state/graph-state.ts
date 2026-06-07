import { Annotation } from '@langchain/langgraph';
import { TenantContext } from '../../../tenant/tenant.service';

/**
 * Defines the state structure for the multi-agent financial graph.
 *
 * Fields:
 *  - userQuery          : original user question
 *  - orgSlug            : tenant identifier
 *  - intent             : classified intent from the orchestrator
 *  - unresolvedIntent   : true when the orchestrator could not classify the query
 *  - agentOutput        : raw text output from the last specialist agent
 *  - finalResponse      : user-facing response formatted by the chatting agent
 *  - ragContext          : aggregated RAG context string (used by financial reasoning agent)
 *  - reasoningOutput    : structured reasoning result from the financial reasoning agent
 *  - reportMarkdown     : final formatted Markdown report from the report generation agent
 *  - reportType         : type of report being generated (inferred by reasoning agent)
 */
export const MultiAgentState = Annotation.Root({
  userQuery: Annotation<string>(),
  orgSlug: Annotation<string>(),
  tenantContext: Annotation<TenantContext>(),
  organizationName: Annotation<string>(),
  financialDatabaseContext: Annotation<string | undefined>(),

  intent: Annotation<
    | 'databaseSearchAgent'
    | 'financialReasoningAgent'
    | 'ragSearchAgent'
    | 'other'
    | undefined
  >(),

  unresolvedIntent: Annotation<boolean | undefined>(),
  agentOutput: Annotation<string | undefined>(),
  finalResponse: Annotation<string | undefined>(),

  // RAG & reasoning pipeline fields
  ragContext: Annotation<string | undefined>(),
  reasoningOutput: Annotation<string | undefined>(),
  reportMarkdown: Annotation<string | undefined>(),
  reportType: Annotation<string | undefined>(),
});

export type StateType = typeof MultiAgentState.State;
