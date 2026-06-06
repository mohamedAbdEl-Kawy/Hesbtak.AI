import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';

import {
  ConfirmAccountMappingDto,
  ConfirmClassificationDto,
  ConfirmExtractionDto,
  ConfirmJournalDto,
  ConfirmPaymentDto,
} from './dto/approval.dto';
import { CreateWorkflowDto } from './dto/workflow.dto';
import { UploadFileInterceptor } from './interceptors/file-upload.interceptor';
import { WorkflowGraphService } from './workflow-graph.service';
import { WorkflowService } from './workflow.service';
import { WorkflowStatus } from './enums/workflow-status.enum';
import { WorkflowStep } from './enums/workflow-step.enum';
import {
  AccountMappingResult,
  ClassificationResult,
  ExtractionResult,
  JournalProposal,
  PaymentProposal,
} from './types/workflow.types';
import {
  validateAccountMappingResult,
  validateClassificationResult,
  validateJournalProposal,
  validatePaymentProposal,
} from './utils/workflow-validation.util';

@Controller('workflow')
export class WorkflowController {
  constructor(
    private readonly workflowService: WorkflowService,
    private readonly workflowGraphService: WorkflowGraphService,
  ) {}

  @Post()
  async createWorkflow(@Body() dto: CreateWorkflowDto) {
    return this.workflowService.createWorkflow(
      dto.documentSide,
      dto.paymentStatus,
    );
  }

  @Get(':id')
  async getWorkflow(@Param('id') id: string) {
    return this.workflowService.getWorkflow(id);
  }

  @Post(':id/upload')
  @UseInterceptors(UploadFileInterceptor.single())
  async uploadInvoice(
    @Param('id') workflowId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const workflow = await this.workflowService.getWorkflow(workflowId);

    this.workflowService.assertCurrentStep(workflow, WorkflowStep.EXTRACTION);

    const payload = this.workflowService.getPayload(workflow);
    const extraction = await this.workflowGraphService.runExtraction(
      payload,
      file,
    );

    await this.workflowService.saveProposal(workflowId, WorkflowStep.EXTRACTION_REVIEW, {
      extractionProposal: extraction,
    });

    return this.workflowService.waitingResponse('EXTRACTION', extraction);
  }

  @Post(':id/confirm-extraction')
  async confirmExtraction(
    @Param('id') workflowId: string,
    @Body() dto: ConfirmExtractionDto,
  ) {
    const workflow = await this.workflowService.getWorkflow(workflowId);
    const payload = this.workflowService.getPayload(workflow);
    const approvedExtraction =
      dto.approvedData ?? (payload.extractionProposal as ExtractionResult);

    const updatedWorkflow = await this.workflowService.approveAndSave(
      workflowId,
      WorkflowStep.EXTRACTION_REVIEW,
      {
        approvedExtraction,
      },
      WorkflowStep.CLASSIFICATION_REVIEW,
    );

    const classification = await this.workflowGraphService.runClassification({
      ...this.workflowService.getPayload(updatedWorkflow),
      approvedExtraction,
    });

    await this.workflowService.saveProposal(
      workflowId,
      WorkflowStep.CLASSIFICATION_REVIEW,
      {
        classificationProposal: classification,
      },
    );

    return this.workflowService.waitingResponse('CLASSIFICATION', classification);
  }

  @Post(':id/confirm-classification')
  async confirmClassification(
    @Param('id') workflowId: string,
    @Body() dto: ConfirmClassificationDto,
  ) {
    const workflow = await this.workflowService.getWorkflow(workflowId);
    const payload = this.workflowService.getPayload(workflow);
    const approvedClassification = validateClassificationResult(
      dto.approvedData ??
        (payload.classificationProposal as ClassificationResult),
    );

    const updatedWorkflow = await this.workflowService.approveAndSave(
      workflowId,
      WorkflowStep.CLASSIFICATION_REVIEW,
      {
        approvedClassification,
        mappingContext: dto.context,
      },
      WorkflowStep.ACCOUNT_MAPPING_REVIEW,
    );

    const accountMapping = await this.workflowGraphService.runAccountMapping(
      {
        ...this.workflowService.getPayload(updatedWorkflow),
        approvedClassification,
        mappingContext: dto.context,
      },
      dto.context,
    );

    await this.workflowService.saveProposal(
      workflowId,
      WorkflowStep.ACCOUNT_MAPPING_REVIEW,
      {
        accountMappingProposal: accountMapping,
      },
    );

    return this.workflowService.waitingResponse(
      'ACCOUNT_MAPPING',
      accountMapping,
    );
  }

  @Post(':id/confirm-account-mapping')
  async confirmAccountMapping(
    @Param('id') workflowId: string,
    @Body() dto: ConfirmAccountMappingDto,
  ) {
    const workflow = await this.workflowService.getWorkflow(workflowId);
    const payload = this.workflowService.getPayload(workflow);
    const approvedAccountMapping = validateAccountMappingResult(
      dto.approvedData ??
        (payload.accountMappingProposal as AccountMappingResult),
    );

    const updatedWorkflow = await this.workflowService.approveAndSave(
      workflowId,
      WorkflowStep.ACCOUNT_MAPPING_REVIEW,
      {
        approvedAccountMapping,
      },
      WorkflowStep.JOURNAL_REVIEW,
    );

    const journal = await this.workflowGraphService.runJournal({
      ...this.workflowService.getPayload(updatedWorkflow),
      approvedAccountMapping,
    });

    await this.workflowService.saveProposal(workflowId, WorkflowStep.JOURNAL_REVIEW, {
      journalProposal: journal,
    });

    return this.workflowService.waitingResponse('JOURNAL', journal);
  }

  @Post(':id/confirm-journal')
  async confirmJournal(
    @Param('id') workflowId: string,
    @Body() dto: ConfirmJournalDto,
  ) {
    const workflow = await this.workflowService.getWorkflow(workflowId);
    const payload = this.workflowService.getPayload(workflow);
    const approvedJournal = validateJournalProposal(
      dto.approvedData ?? (payload.journalProposal as JournalProposal),
    );

    const nextStep = this.workflowService.paymentIsPaid(payload.paymentStatus)
      ? WorkflowStep.PAYMENT_REVIEW
      : WorkflowStep.COMPLETED;

    const updatedWorkflow = await this.workflowService.approveAndSave(
      workflowId,
      WorkflowStep.JOURNAL_REVIEW,
      {
        approvedJournal,
      },
      nextStep,
      this.workflowService.paymentIsPaid(payload.paymentStatus)
        ? WorkflowStatus.PENDING
        : WorkflowStatus.COMPLETED,
    );

    if (!this.workflowService.paymentIsPaid(payload.paymentStatus)) {
      return this.workflowService.completedResponse(
        this.workflowService.getPayload(updatedWorkflow),
      );
    }

    const payment = await this.workflowGraphService.runPayment({
      ...this.workflowService.getPayload(updatedWorkflow),
      approvedJournal,
    });

    await this.workflowService.saveProposal(workflowId, WorkflowStep.PAYMENT_REVIEW, {
      paymentProposal: payment,
    });

    return this.workflowService.waitingResponse('PAYMENT', payment);
  }

  @Post(':id/confirm-payment')
  async confirmPayment(
    @Param('id') workflowId: string,
    @Body() dto: ConfirmPaymentDto,
  ) {
    const workflow = await this.workflowService.getWorkflow(workflowId);
    const payload = this.workflowService.getPayload(workflow);
    const approvedPayment = validatePaymentProposal(
      dto.approvedData ?? (payload.paymentProposal as PaymentProposal),
    );

    this.workflowService.assertCurrentStep(workflow, WorkflowStep.PAYMENT_REVIEW);

    const updatedWorkflow = await this.workflowService.markCompleted(workflowId, {
      approvedPayment,
    });

    return this.workflowService.completedResponse(
      this.workflowService.getPayload(updatedWorkflow),
    );
  }
}
