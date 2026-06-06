import { Injectable } from '@nestjs/common';
import { AccountingService } from '../accounting/accounting.service';
import { TenantContext } from '../tenant/tenant.service';
import {
  DirectoryAccount,
  DirectoryParty,
  MappingContext,
  SystemApprovalRecord,
  WorkflowPayload,
} from './types';
import { WorkflowGraphService } from './workflow-graph.service';
import {
  AiWorkflowStatus,
  AiWorkflowStep,
  WorkflowStateService,
} from './workflow-state.service';
import { SystemApprovalService } from './system-approval.service';
import { WorkflowPersistenceService } from './workflow-persistence.service';

type RawAccount = {
  id: string;
  name: string;
  type?: string;
};

type RawParty = {
  id: string;
  name: string;
};

@Injectable()
export class WorkflowAutomationService {
  constructor(
    private readonly accounting: AccountingService,
    private readonly graph: WorkflowGraphService,
    private readonly state: WorkflowStateService,
    private readonly systemApproval: SystemApprovalService,
    private readonly persistence: WorkflowPersistenceService,
  ) {}

  async runFromUpload(input: {
    workflowId: string;
    tenant: TenantContext;
    userId: string;
    file: Express.Multer.File;
  }) {
    try {
      const workflow = await this.state.getWorkflow(
        input.workflowId,
        input.tenant.organizationId,
        input.userId,
      );
      this.state.assertCurrentStep(workflow, AiWorkflowStep.EXTRACTION);

      const initialPayload = this.state.getPayload(workflow);
      const approvals: SystemApprovalRecord[] = [
        ...(initialPayload.systemApprovals ?? []),
      ];

      const extraction = await this.graph.runExtraction(initialPayload, input.file);
      approvals.push(this.systemApproval.approveExtraction(extraction, initialPayload));
      let updated = await this.state.approveAndSave(
        input.workflowId,
        input.tenant.organizationId,
        input.userId,
        AiWorkflowStep.EXTRACTION,
        {
          extractionProposal: extraction,
          approvedExtraction: extraction,
          systemApprovals: approvals,
        },
        AiWorkflowStep.CLASSIFICATION_REVIEW,
      );

      const classification = await this.graph.runClassification({
        ...this.state.getPayload(updated),
        approvedExtraction: extraction,
      });
      approvals.push(
        this.systemApproval.approveClassification(
          classification,
          this.state.getPayload(updated),
        ),
      );
      updated = await this.state.approveAndSave(
        input.workflowId,
        input.tenant.organizationId,
        input.userId,
        AiWorkflowStep.CLASSIFICATION_REVIEW,
        {
          classificationProposal: classification,
          approvedClassification: classification,
          systemApprovals: approvals,
        },
        AiWorkflowStep.ACCOUNT_MAPPING_REVIEW,
      );

      const context = await this.loadMappingContext(input.tenant);
      const accountMapping = await this.graph.runAccountMapping(
        {
          ...this.state.getPayload(updated),
          approvedClassification: classification,
          mappingContext: context,
        },
        context,
      );
      approvals.push(
        this.systemApproval.approveAccountMapping(
          accountMapping,
          {
            ...this.state.getPayload(updated),
            approvedClassification: classification,
          },
          context,
        ),
      );
      updated = await this.state.approveAndSave(
        input.workflowId,
        input.tenant.organizationId,
        input.userId,
        AiWorkflowStep.ACCOUNT_MAPPING_REVIEW,
        {
          mappingContext: context,
          accountMappingProposal: accountMapping,
          approvedAccountMapping: accountMapping,
          systemApprovals: approvals,
        },
        AiWorkflowStep.JOURNAL_REVIEW,
      );

      const journal = await this.graph.runJournal({
        ...this.state.getPayload(updated),
        approvedAccountMapping: accountMapping,
      });
      approvals.push(this.systemApproval.approveJournal(journal, context));

      const afterJournal = await this.state.approveAndSave(
        input.workflowId,
        input.tenant.organizationId,
        input.userId,
        AiWorkflowStep.JOURNAL_REVIEW,
        {
          journalProposal: journal,
          approvedJournal: journal,
          systemApprovals: approvals,
        },
        initialPayload.paymentStatus === 'paid'
          ? AiWorkflowStep.PAYMENT_REVIEW
          : AiWorkflowStep.COMPLETED,
        initialPayload.paymentStatus === 'paid'
          ? AiWorkflowStatus.PENDING
          : AiWorkflowStatus.COMPLETED,
      );

      if (initialPayload.paymentStatus !== 'paid') {
        const persistedRecords = await this.persistence.persistApprovedWorkflow({
          tenant: input.tenant,
          userId: input.userId,
          payload: this.state.getPayload(afterJournal),
        });
        const completed = await this.state.markCompleted(
          input.workflowId,
          input.tenant.organizationId,
          input.userId,
          { persistedRecords },
        );

        return this.state.completedResponse(this.state.getPayload(completed));
      }

      const payment = await this.graph.runPayment({
        ...this.state.getPayload(afterJournal),
        approvedJournal: journal,
      });
      approvals.push(
        this.systemApproval.approvePayment(
          payment,
          {
            ...this.state.getPayload(afterJournal),
            approvedJournal: journal,
          },
          context,
        ),
      );

      const payloadBeforePersistence: WorkflowPayload = {
        ...this.state.getPayload(afterJournal),
        paymentProposal: payment,
        approvedPayment: payment,
        systemApprovals: approvals,
      };
      const persistedRecords = await this.persistence.persistApprovedWorkflow({
        tenant: input.tenant,
        userId: input.userId,
        payload: payloadBeforePersistence,
      });

      const completed = await this.state.markCompleted(
        input.workflowId,
        input.tenant.organizationId,
        input.userId,
        {
          paymentProposal: payment,
          approvedPayment: payment,
          systemApprovals: approvals,
          persistedRecords,
        },
      );

      return this.state.completedResponse(this.state.getPayload(completed));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Workflow automation failed';
      await this.state.markFailed(
        input.workflowId,
        input.tenant.organizationId,
        input.userId,
        message,
      );
      throw error;
    }
  }

  private async loadMappingContext(tenant: TenantContext): Promise<MappingContext> {
    const [accounts, customers, vendors] = await Promise.all([
      this.accounting.listAccounts(tenant) as Promise<RawAccount[]>,
      this.accounting.listCustomers(tenant) as Promise<RawParty[]>,
      this.accounting.listVendors(tenant) as Promise<RawParty[]>,
    ]);

    return {
      accounts: accounts.map((account): DirectoryAccount => ({
        id: account.id,
        name: account.name,
        type: account.type,
      })),
      customers: customers.map((customer): DirectoryParty => ({
        id: customer.id,
        name: customer.name,
      })),
      vendors: vendors.map((vendor): DirectoryParty => ({
        id: vendor.id,
        name: vendor.name,
      })),
    };
  }
}
