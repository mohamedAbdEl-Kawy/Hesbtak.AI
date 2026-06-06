import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DataBaseModule } from '../../database/database.module';
import { TenantModule } from '../tenant/tenant.module';
import { AccountingModule } from '../accounting/accounting.module';
import { AiLlmService } from './ai-llm.service';
import { AiWorkflowController } from './ai-workflow.controller';
import { WorkflowGraphService } from './workflow-graph.service';
import { WorkflowStateService } from './workflow-state.service';
import { SystemApprovalService } from './system-approval.service';
import { WorkflowAutomationService } from './workflow-automation.service';
import { WorkflowPersistenceService } from './workflow-persistence.service';

@Module({
  imports: [ConfigModule, DataBaseModule, TenantModule, AccountingModule],
  controllers: [AiWorkflowController],
  providers: [
    AiLlmService,
    WorkflowGraphService,
    WorkflowStateService,
    SystemApprovalService,
    WorkflowAutomationService,
    WorkflowPersistenceService,
  ],
  exports: [
    WorkflowGraphService,
    WorkflowStateService,
    WorkflowAutomationService,
    WorkflowPersistenceService,
  ],
})
export class AiModule {}
