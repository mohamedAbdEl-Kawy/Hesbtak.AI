import { Module } from '@nestjs/common';

import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { AiModule } from '../../ai/ai.module';
import { WorkflowGraphService } from './workflow-graph.service';

@Module({
  imports: [AiModule],
  controllers: [WorkflowController],
  providers: [WorkflowService, WorkflowGraphService],
})
export class WorkflowModule {}
