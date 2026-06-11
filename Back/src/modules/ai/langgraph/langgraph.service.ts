import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StateGraph, START, END } from '@langchain/langgraph';
import { TenantContext } from '../../tenant/tenant.service';
import { RetrievalService } from '../retrieval/retrieval.service';
import { RunGraphDto } from './dto/run-graph.dto';
import {
  getGroqClient,
  hasGroqApiKey,
  LLM_MODELS,
} from './config/llm.config';
import { MultiAgentState, StateType } from './state/graph-state';
import { chattingAgentNode } from './agents/chatting-agent';
import { orchestratorAgentNode } from './agents/orchestrator-agent';
import { DatabaseSearchAgentGraph } from './agents/database-search-agent';
import { financialReasoningAgentNode } from './agents/financial-reasoning-agent';
import { reportGenerationAgentNode } from './agents/report-generation-agent';
import { ragSearchAgentNode } from './agents/rag-search-agent';
import Groq from 'groq-sdk';
import { FinancialContextService } from '../financial-context.service';
import { inferReportProfile } from './report-profile';

type GraphRunInput = RunGraphDto & { conversationHistory?: string };

@Injectable()
export class LanggraphService {
  private readonly groqClient: Groq;
  private readonly compiledGraph;

  constructor(
    private readonly config: ConfigService,
    private readonly databaseSearchAgentGraph: DatabaseSearchAgentGraph,
    private readonly retrievalService: RetrievalService,
    private readonly financialContext: FinancialContextService,
  ) {
    this.groqClient = getGroqClient(this.config);

    /**
     * Graph topology:
     *
     *   START
     *     → chattingAgent
     *     → [orchestrator]
     *          → databaseSearchAgent → chattingAgent → END
     *          → ragSearchAgent      → chattingAgent → END
     *          → financialReasoningAgent
     *               → reportGenerationAgent → chattingAgent → END
     *          → chattingAgent (other / unresolved) → END
     */
    const workflow = new StateGraph(MultiAgentState)
      // ── Nodes ──────────────────────────────────────────────────────────────
      .addNode('chattingAgent', (state) =>
        chattingAgentNode(state, this.groqClient),
      )
      .addNode('orchestrator', (state) =>
        orchestratorAgentNode(state, this.groqClient),
      )
      .addNode('databaseSearchAgent', (state) =>
        this.databaseSearchAgentGraph.invoke(state, this.groqClient),
      )
      .addNode('ragSearchAgent', (state) =>
        ragSearchAgentNode(state, this.groqClient, this.retrievalService),
      )
      .addNode('financialReasoningAgent', (state) =>
        financialReasoningAgentNode(
          state,
          this.groqClient,
          this.retrievalService,
          this.financialContext,
        ),
      )
      .addNode('reportGenerationAgent', (state) =>
        reportGenerationAgentNode(state, this.groqClient),
      )

      // ── Edges ──────────────────────────────────────────────────────────────
      .addEdge(START, 'chattingAgent')

      // First pass: no intent yet → orchestrate; Second pass: has response → end
      .addConditionalEdges('chattingAgent', this.routeFromChattingAgent.bind(this))

      // Orchestrator routes to one specialist agent
      .addConditionalEdges('orchestrator', this.routeFromOrchestrator.bind(this))

      // Simple agents return directly to chatting agent for final formatting
      .addEdge('databaseSearchAgent', 'chattingAgent')
      .addEdge('ragSearchAgent', 'chattingAgent')

      // Financial reasoning always goes through report generation before chatting
      .addEdge('financialReasoningAgent', 'reportGenerationAgent')
      .addEdge('reportGenerationAgent', 'chattingAgent');

    this.compiledGraph = workflow.compile();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  async run(ctx: TenantContext, dto: GraphRunInput) {
    if (!hasGroqApiKey(this.config)) {
      throw new ServiceUnavailableException(
        'AI assistant is not configured. Set GROQ_API_KEY in the backend environment.',
      );
    }

    try {
      const financialContext = await this.financialContext.build(ctx);
      const conversationHistory = dto.conversationHistory?.trim() ?? '';
      const contextualQuery = await this.contextualizeQuery(
        dto.userQuery,
        conversationHistory,
      );
      const reportProfile = inferReportProfile(contextualQuery);
      const initialState: Partial<StateType> = {
        userQuery: contextualQuery,
        originalUserQuery: dto.userQuery,
        conversationHistory,
        orgSlug: ctx.schemaName,
        tenantContext: ctx,
        organizationName: financialContext.organization.name,
        financialDatabaseContext: JSON.stringify(
          financialContext,
          (_key, value) =>
            typeof value === 'bigint' ? Number(value) : value,
        ),
        intent: undefined,
        agentOutput: undefined,
        finalResponse: undefined,
        unresolvedIntent: undefined,
        ragContext: undefined,
        reasoningOutput: undefined,
        reportMarkdown: undefined,
        reportType: reportProfile.title,
      };

      const result = await this.compiledGraph.invoke(initialState);

      return {
        intent: result.intent,
        agentOutput: result.agentOutput,
        finalResponse: result.finalResponse,
        unresolvedIntent: result.unresolvedIntent ?? false,
        reportMarkdown: result.reportMarkdown ?? null,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new InternalServerErrorException(`LangGraph execution failed: ${error}`);
    }
  }

  private async contextualizeQuery(
    userQuery: string,
    conversationHistory: string,
  ) {
    if (!conversationHistory) return userQuery;
    try {
      const response = await this.groqClient.chat.completions.create({
        model: LLM_MODELS.ORCHESTRATOR_AGENT,
        messages: [
          {
            role: 'system',
            content:
              'Rewrite the latest user message as a standalone financial request using the conversation history. Preserve intent, names, dates, and requested report type. Return only the rewritten request. Do not answer it.',
          },
          {
            role: 'user',
            content: `Conversation history:\n${conversationHistory}\n\nLatest user message:\n${userQuery}`,
          },
        ],
        temperature: 0,
        max_tokens: 300,
      });
      return response.choices[0]?.message?.content?.trim() || userQuery;
    } catch {
      return userQuery;
    }
  }

  // ─── Routing functions ───────────────────────────────────────────────────────

  /**
   * After chattingAgent:
   *  - No intent yet (first pass) → go to orchestrator
   *  - Intent is set (second pass, after specialist ran) → END
   */
  private routeFromChattingAgent(state: StateType): string {
    if (state.intent === undefined) {
      return 'orchestrator';
    }
    return END;
  }

  /**
   * After orchestrator:
   *  - Classified intent → route to matching specialist agent
   *  - 'other' or unresolved → loop back to chattingAgent for friendly response
   */
  private routeFromOrchestrator(state: StateType): string {
    const intent = state.intent;

    if (intent === 'databaseSearchAgent') return 'databaseSearchAgent';
    if (intent === 'ragSearchAgent') return 'ragSearchAgent';
    if (intent === 'financialReasoningAgent') return 'financialReasoningAgent';

    // 'other' or undefined → chattingAgent handles it with an unresolved response
    return 'chattingAgent';
  }
}
