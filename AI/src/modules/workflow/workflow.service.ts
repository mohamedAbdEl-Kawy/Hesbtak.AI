import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WorkflowSession } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { WorkflowStatus } from './enums/workflow-status.enum';
import { WorkflowStep } from './enums/workflow-step.enum';
import {
  CompletedWorkflowResponse,
  PaymentStatus,
  DocumentSide,
  WaitingForApprovalResponse,
  WorkflowPayload,
  WorkflowReviewStep,
} from './types/workflow.types';

@Injectable()
export class WorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  async createWorkflow(documentSide: DocumentSide, paymentStatus: PaymentStatus) {
    return this.prisma.workflowSession.create({
      data: {
        organizationId: 'org-demo-id',
        createdBy: 'user-demo-id',
        currentStep: WorkflowStep.EXTRACTION,
        status: WorkflowStatus.PENDING,
        payload: this.toJson({
          documentSide,
          paymentStatus,
        }),
      },
    });
  }

  async getWorkflow(workflowId: string) {
    const workflow = await this.prisma.workflowSession.findUnique({
      where: {
        id: workflowId,
      },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    return workflow;
  }

  async saveProposal(
    workflowId: string,
    currentStep: WorkflowStep,
    proposalPatch: Partial<WorkflowPayload>,
  ) {
    const workflow = await this.getWorkflow(workflowId);
    const payload = this.getPayload(workflow);

    return this.prisma.workflowSession.update({
      where: {
        id: workflowId,
      },
      data: {
        currentStep,
        status: WorkflowStatus.WAITING_FOR_APPROVAL,
        payload: this.toJson({
          ...payload,
          ...proposalPatch,
        }),
      },
    });
  }

  async approveAndSave(
    workflowId: string,
    expectedStep: WorkflowStep,
    payloadPatch: Partial<WorkflowPayload>,
    nextStep: WorkflowStep,
    status: WorkflowStatus = WorkflowStatus.PENDING,
  ) {
    const workflow = await this.getWorkflow(workflowId);

    this.assertCurrentStep(workflow, expectedStep);

    const payload = this.getPayload(workflow);

    return this.prisma.workflowSession.update({
      where: {
        id: workflowId,
      },
      data: {
        currentStep: nextStep,
        status,
        payload: this.toJson({
          ...payload,
          ...payloadPatch,
        }),
      },
    });
  }

  async markCompleted(workflowId: string, payloadPatch: Partial<WorkflowPayload>) {
    const workflow = await this.getWorkflow(workflowId);
    const payload = this.getPayload(workflow);

    return this.prisma.workflowSession.update({
      where: {
        id: workflowId,
      },
      data: {
        currentStep: WorkflowStep.COMPLETED,
        status: WorkflowStatus.COMPLETED,
        payload: this.toJson({
          ...payload,
          ...payloadPatch,
        }),
      },
    });
  }

  getPayload(workflow: WorkflowSession): WorkflowPayload {
    return workflow.payload as unknown as WorkflowPayload;
  }

  assertCurrentStep(workflow: WorkflowSession, expectedStep: WorkflowStep) {
    if (workflow.currentStep !== expectedStep) {
      throw new BadRequestException(
        `Workflow is at ${workflow.currentStep}, expected ${expectedStep}`,
      );
    }
  }

  waitingResponse<T>(
    step: WorkflowReviewStep,
    data: T,
  ): WaitingForApprovalResponse<T> {
    return {
      status: 'WAITING_FOR_APPROVAL',
      step,
      data,
    };
  }

  completedResponse(payload: WorkflowPayload): CompletedWorkflowResponse {
    return {
      status: 'COMPLETED',
      step: 'COMPLETE',
      data: payload,
    };
  }

  paymentIsPaid(paymentStatus: PaymentStatus) {
    return paymentStatus === 'paid';
  }

  private toJson(value: WorkflowPayload): Prisma.InputJsonValue {
    return value as unknown as Prisma.InputJsonValue;
  }
}
