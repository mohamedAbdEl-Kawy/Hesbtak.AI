import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WorkflowSession } from '@prisma/client';
import { DataBaseService } from '../../database/database.service';
import { DocumentSide, PaymentStatus, WorkflowPayload, WorkflowReviewStep } from './types';

export enum AiWorkflowStep {
  EXTRACTION = 'EXTRACTION',
  EXTRACTION_REVIEW = 'EXTRACTION_REVIEW',
  CLASSIFICATION_REVIEW = 'CLASSIFICATION_REVIEW',
  ACCOUNT_MAPPING_REVIEW = 'ACCOUNT_MAPPING_REVIEW',
  JOURNAL_REVIEW = 'JOURNAL_REVIEW',
  PAYMENT_REVIEW = 'PAYMENT_REVIEW',
  COMPLETED = 'COMPLETED',
}

export enum AiWorkflowStatus {
  PENDING = 'PENDING',
  WAITING_FOR_APPROVAL = 'WAITING_FOR_APPROVAL',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Injectable()
export class WorkflowStateService {
  constructor(private readonly db: DataBaseService) {}

  async createWorkflow(input: {
    organizationId: string;
    userId: string;
    documentSide: DocumentSide;
    paymentStatus: PaymentStatus;
  }) {
    return this.db.workflowSession.create({
      data: {
        organizationId: input.organizationId,
        createdBy: input.userId,
        currentStep: AiWorkflowStep.EXTRACTION,
        status: AiWorkflowStatus.PENDING,
        payload: this.toJson({
          documentSide: input.documentSide,
          paymentStatus: input.paymentStatus,
        }),
      },
    });
  }

  async getWorkflow(workflowId: string, organizationId: string, userId: string) {
    const workflow = await this.db.workflowSession.findFirst({
      where: {
        id: workflowId,
        organizationId,
        createdBy: userId,
      },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    return workflow;
  }

  async saveProposal(
    workflowId: string,
    organizationId: string,
    userId: string,
    currentStep: AiWorkflowStep,
    patch: Partial<WorkflowPayload>,
  ) {
    const workflow = await this.getWorkflow(workflowId, organizationId, userId);
    const payload = this.getPayload(workflow);

    return this.db.workflowSession.update({
      where: { id: workflowId },
      data: {
        currentStep,
        status: AiWorkflowStatus.WAITING_FOR_APPROVAL,
        payload: this.toJson({ ...payload, ...patch }),
      },
    });
  }

  async approveAndSave(
    workflowId: string,
    organizationId: string,
    userId: string,
    expectedStep: AiWorkflowStep,
    patch: Partial<WorkflowPayload>,
    nextStep: AiWorkflowStep,
    status: AiWorkflowStatus = AiWorkflowStatus.PENDING,
  ) {
    const workflow = await this.getWorkflow(workflowId, organizationId, userId);
    this.assertCurrentStep(workflow, expectedStep);
    const payload = this.getPayload(workflow);

    return this.db.workflowSession.update({
      where: { id: workflowId },
      data: {
        currentStep: nextStep,
        status,
        payload: this.toJson({ ...payload, ...patch }),
      },
    });
  }

  async markCompleted(
    workflowId: string,
    organizationId: string,
    userId: string,
    patch: Partial<WorkflowPayload>,
  ) {
    const workflow = await this.getWorkflow(workflowId, organizationId, userId);
    const payload = this.getPayload(workflow);

    return this.db.workflowSession.update({
      where: { id: workflowId },
      data: {
        currentStep: AiWorkflowStep.COMPLETED,
        status: AiWorkflowStatus.COMPLETED,
        payload: this.toJson({ ...payload, ...patch }),
      },
    });
  }

  async markFailed(
    workflowId: string,
    organizationId: string,
    userId: string,
    message: string,
  ) {
    const workflow = await this.getWorkflow(workflowId, organizationId, userId);
    const payload = this.getPayload(workflow);

    return this.db.workflowSession.update({
      where: { id: workflowId },
      data: {
        status: AiWorkflowStatus.FAILED,
        payload: this.toJson({
          ...payload,
          automationError: message,
        }),
      },
    });
  }

  getPayload(workflow: WorkflowSession): WorkflowPayload {
    return workflow.payload as unknown as WorkflowPayload;
  }

  assertCurrentStep(workflow: WorkflowSession, expectedStep: AiWorkflowStep) {
    if (workflow.currentStep !== expectedStep) {
      throw new BadRequestException(
        `Workflow is at ${workflow.currentStep}, expected ${expectedStep}`,
      );
    }
  }

  waitingResponse<T>(step: WorkflowReviewStep, data: T) {
    return {
      status: AiWorkflowStatus.WAITING_FOR_APPROVAL,
      step,
      data,
    };
  }

  completedResponse(payload: WorkflowPayload) {
    return {
      status: AiWorkflowStatus.COMPLETED,
      step: 'COMPLETE',
      data: payload,
    };
  }

  private toJson(value: WorkflowPayload): Prisma.InputJsonValue {
    return value as unknown as Prisma.InputJsonValue;
  }
}
