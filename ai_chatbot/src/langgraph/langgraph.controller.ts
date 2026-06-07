import { Body, Controller, Param, Post } from '@nestjs/common';
import { RunGraphDto } from './dto/run-graph.dto';
import { LanggraphService } from './langgraph.service';

@Controller('tenants/:orgSlug/langgraph')
export class LanggraphController {
  constructor(private readonly langgraphService: LanggraphService) {}

  /**
   * POST /tenants/:orgSlug/langgraph/run
   *
   * Runs the multi-agent financial graph for the given tenant.
   *
   * Response fields:
   *  - intent          : classified intent (databaseSearchAgent | ragSearchAgent | financialReasoningAgent | other)
   *  - agentOutput     : raw output from the specialist agent
   *  - finalResponse   : user-facing formatted response from the chatting agent
   *  - unresolvedIntent: true if the orchestrator could not classify the query
   *  - reportMarkdown  : full Markdown report (non-null only for financialReasoningAgent flows)
   */
  @Post('run')
  run(@Param('orgSlug') orgSlug: string, @Body() dto: RunGraphDto) {
    return this.langgraphService.run(orgSlug, dto);
  }
}
