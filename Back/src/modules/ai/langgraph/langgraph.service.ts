import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StateGraph, START, END } from '@langchain/langgraph';
import { TenantContext } from '../../tenant/tenant.service';
import { RetrievalService } from '../retrieval/retrieval.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { RunGraphDto } from './dto/run-graph.dto';
import { getGroqClient } from './config/llm.config';
import { MultiAgentState, StateType } from './state/graph-state';
import { chattingAgentNode } from './agents/chatting-agent';
import { orchestratorAgentNode } from './agents/orchestrator-agent';
import { DatabaseSearchAgentGraph } from './agents/database-search-agent';
import { financialReasoningAgentNode } from './agents/financial-reasoning-agent';
import { reportGenerationAgentNode } from './agents/report-generation-agent';
import { ragSearchAgentNode } from './agents/rag-search-agent';
import Groq from 'groq-sdk';
import { FinancialContextService } from '../financial-context.service';

@Injectable()
export class LanggraphService {
  private readonly groqClient: Groq;
  private readonly compiledGraph;

  constructor(
    private readonly config: ConfigService,
    private readonly databaseSearchAgentGraph: DatabaseSearchAgentGraph,
    private readonly retrievalService: RetrievalService,
    private readonly embeddingsService: EmbeddingsService,
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
          this.embeddingsService,
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

  async run(ctx: TenantContext, dto: RunGraphDto) {
    try {
      const financialContext = await this.financialContext.build(ctx);
      const initialState: Partial<StateType> = {
        userQuery: dto.userQuery,
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
        reportType: undefined,
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
      throw new InternalServerErrorException(`LangGraph execution failed: ${error}`);
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
