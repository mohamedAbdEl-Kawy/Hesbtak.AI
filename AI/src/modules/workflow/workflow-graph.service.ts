import { BadRequestException, Injectable } from '@nestjs/common';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

import { AccountMappingService } from '../../ai/services/account-mapping.service';
import { ClassificationService } from '../../ai/services/classification.service';
import { JournalEntryService } from '../../ai/services/journal-entry.service';
import { PaymentService } from '../../ai/services/payment.service';
import { QwenService } from '../../ai/services/qwen.service';
import { INVOICE_EXTRACTION_PROMPT } from '../../ai/prompts/invoice-extraction.prompt';
import { safeJsonParse } from '../../shared/utils/safe-json.util';
import { fileToBase64 } from '../../shared/utils/file-to-base64.util';
import { pdfToImage } from '../../shared/utils/pdf-to-image.util';

import {
  AccountMappingResult,
  ClassificationResult,
  ExtractionResult,
  JournalProposal,
  MappingContext,
  PaymentProposal,
  WorkflowPayload,
} from './types/workflow.types';
import {
  normalizeExtractionResult,
  validateAccountMappingResult,
  validateClassificationResult,
  validateJournalProposal,
  validatePaymentProposal,
} from './utils/workflow-validation.util';

const WorkflowGraphState = Annotation.Root({
  payload: Annotation<WorkflowPayload>(),
  input: Annotation<Record<string, any>>(),
  result: Annotation<Record<string, any> | undefined>(),
});

@Injectable()
export class WorkflowGraphService {
  constructor(
    private readonly qwenService: QwenService,
    private readonly classificationService: ClassificationService,
    private readonly accountMappingService: AccountMappingService,
    private readonly journalEntryService: JournalEntryService,
    private readonly paymentService: PaymentService,
  ) {}

  async runExtraction(
    payload: WorkflowPayload,
    file: Express.Multer.File,
  ): Promise<ExtractionResult> {
    const graph = this.buildSingleNodeGraph('extraction', async () => {
      let imagePath = file.path;

      if (file.mimetype === 'application/pdf') {
        imagePath = await pdfToImage(file.path);
      }

      const imageBase64 = fileToBase64(imagePath);
      const response = await this.qwenService.extractInvoice(
        imageBase64,
        INVOICE_EXTRACTION_PROMPT,
      );
      const raw = this.extractModelJson(response);

      return {
        result: normalizeExtractionResult(raw),
      };
    });

    const state = await graph.invoke({ payload, input: {} });

    return state.result as ExtractionResult;
  }

  async runClassification(
    payload: WorkflowPayload,
  ): Promise<ClassificationResult> {
    if (!payload.approvedExtraction) {
      throw new BadRequestException('Approved extraction is required');
    }

    const graph = this.buildSingleNodeGraph('classification', async () => {
      const response = await this.classificationService.classify({
        invoice: payload.approvedExtraction,
        documentSide: payload.documentSide,
        paymentStatus: payload.paymentStatus,
      });
      const raw = this.extractModelJson(response);

      return {
        result: validateClassificationResult(raw as ClassificationResult),
      };
    });

    const state = await graph.invoke({ payload, input: {} });

    return state.result as ClassificationResult;
  }

  async runAccountMapping(
    payload: WorkflowPayload,
    context: MappingContext,
  ): Promise<AccountMappingResult> {
    if (!payload.approvedExtraction || !payload.approvedClassification) {
      throw new BadRequestException(
        'Approved extraction and classification are required',
      );
    }

    const graph = this.buildSingleNodeGraph('accountMapping', async () => {
      const response = await this.accountMappingService.mapAccounts({
        extraction: payload.approvedExtraction,
        classification: payload.approvedClassification,
        accounts: context.accounts,
        customers: context.customers,
        vendors: context.vendors,
      });
      const raw = this.extractModelJson(response);

      return {
        result: validateAccountMappingResult(raw as AccountMappingResult),
      };
    });

    const state = await graph.invoke({ payload, input: { context } });

    return state.result as AccountMappingResult;
  }

  async runJournal(payload: WorkflowPayload): Promise<JournalProposal> {
    if (
      !payload.approvedExtraction ||
      !payload.approvedClassification ||
      !payload.approvedAccountMapping
    ) {
      throw new BadRequestException(
        'Approved extraction, classification, and account mapping are required',
      );
    }

    const graph = this.buildSingleNodeGraph('journal', async () => {
      const response = await this.journalEntryService.proposeJournal({
        extraction: payload.approvedExtraction,
        classification: payload.approvedClassification,
        accountMapping: payload.approvedAccountMapping,
      });
      const raw = this.extractModelJson(response);

      return {
        result: validateJournalProposal(raw as JournalProposal),
      };
    });

    const state = await graph.invoke({ payload, input: {} });

    return state.result as JournalProposal;
  }

  async runPayment(payload: WorkflowPayload): Promise<PaymentProposal> {
    if (
      !payload.approvedExtraction ||
      !payload.approvedClassification ||
      !payload.approvedJournal
    ) {
      throw new BadRequestException(
        'Approved extraction, classification, and journal are required',
      );
    }

    const graph = this.buildSingleNodeGraph('payment', async () => {
      const response = await this.paymentService.proposePayment({
        extraction: payload.approvedExtraction,
        classification: payload.approvedClassification,
        journal: payload.approvedJournal,
      });
      const raw = this.extractModelJson(response);

      return {
        result: validatePaymentProposal(raw as PaymentProposal),
      };
    });

    const state = await graph.invoke({ payload, input: {} });

    return state.result as PaymentProposal;
  }

  private buildSingleNodeGraph(
    nodeName: string,
    node: (state: typeof WorkflowGraphState.State) => Promise<Record<string, any>>,
  ) {
    return new StateGraph(WorkflowGraphState)
      .addNode(nodeName, node)
      .addEdge(START, nodeName)
      .addEdge(nodeName, END)
      .compile();
  }

  private extractModelJson(response: any): Record<string, any> {
    const content = response?.choices?.[0]?.message?.content ?? '{}';
    const parsed = safeJsonParse(content);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new BadRequestException('Model response was not a valid JSON object');
    }

    return parsed;
  }
}
