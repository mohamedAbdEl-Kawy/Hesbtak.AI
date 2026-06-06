import { BadRequestException, Injectable } from '@nestjs/common';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { AiLlmService } from './ai-llm.service';
import {
  ACCOUNT_MAPPING_PROMPT,
  CLASSIFICATION_PROMPT,
  INVOICE_EXTRACTION_PROMPT,
  JOURNAL_ENTRY_PROMPT,
  PAYMENT_PROMPT,
} from './prompts';
import {
  AccountMappingResult,
  ClassificationResult,
  ExtractionResult,
  JournalProposal,
  MappingContext,
  PaymentProposal,
  WorkflowPayload,
} from './types';
import {
  extractModelJson,
  fileToBase64,
  normalizeExtractionResult,
  pdfToImage,
  validateAccountMappingResult,
  validateClassificationResult,
  validateJournalProposal,
  validatePaymentProposal,
} from './ai-utils';

const WorkflowGraphState = Annotation.Root({
  payload: Annotation<WorkflowPayload>(),
  result: Annotation<unknown>(),
});

@Injectable()
export class WorkflowGraphService {
  constructor(private readonly llm: AiLlmService) {}

  async runExtraction(
    payload: WorkflowPayload,
    file: Express.Multer.File,
  ): Promise<ExtractionResult> {
    const graph = this.singleNodeGraph('extraction', async () => {
      let imagePath = file.path;
      if (file.mimetype === 'application/pdf') {
        imagePath = await pdfToImage(file.path);
      }

      const response = await this.llm.visionJson(
        fileToBase64(imagePath),
        INVOICE_EXTRACTION_PROMPT,
      );
      const raw = extractModelJson(response);

      return {
        result: normalizeExtractionResult(raw),
      };
    });

    const state = await graph.invoke({ payload, result: undefined });
    return state.result as ExtractionResult;
  }

  async runClassification(payload: WorkflowPayload): Promise<ClassificationResult> {
    if (!payload.approvedExtraction) {
      throw new BadRequestException('Approved extraction is required');
    }

    const graph = this.singleNodeGraph('classification', async () => {
      const response = await this.llm.textJson(CLASSIFICATION_PROMPT, {
        invoice: payload.approvedExtraction,
        documentSide: payload.documentSide,
        paymentStatus: payload.paymentStatus,
      });
      const raw = extractModelJson(response);

      return {
        result: validateClassificationResult(raw as unknown as ClassificationResult),
      };
    });

    const state = await graph.invoke({ payload, result: undefined });
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

    const graph = this.singleNodeGraph('accountMapping', async () => {
      const response = await this.llm.textJson(ACCOUNT_MAPPING_PROMPT, {
        extraction: payload.approvedExtraction,
        classification: payload.approvedClassification,
        accounts: context.accounts,
        customers: context.customers,
        vendors: context.vendors,
      });
      const raw = extractModelJson(response);

      return {
        result: validateAccountMappingResult(raw as unknown as AccountMappingResult),
      };
    });

    const state = await graph.invoke({ payload, result: undefined });
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

    const graph = this.singleNodeGraph('journal', async () => {
      const response = await this.llm.textJson(JOURNAL_ENTRY_PROMPT, {
        extraction: payload.approvedExtraction,
        classification: payload.approvedClassification,
        accountMapping: payload.approvedAccountMapping,
      });
      const raw = extractModelJson(response);

      return {
        result: validateJournalProposal(raw as unknown as JournalProposal),
      };
    });

    const state = await graph.invoke({ payload, result: undefined });
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

    const graph = this.singleNodeGraph('payment', async () => {
      const response = await this.llm.textJson(PAYMENT_PROMPT, {
        extraction: payload.approvedExtraction,
        classification: payload.approvedClassification,
        journal: payload.approvedJournal,
      });
      const raw = extractModelJson(response);

      return {
        result: validatePaymentProposal(raw as unknown as PaymentProposal),
      };
    });

    const state = await graph.invoke({ payload, result: undefined });
    return state.result as PaymentProposal;
  }

  private singleNodeGraph(
    nodeName: string,
    node: () => Promise<{ result: unknown }>,
  ) {
    return new StateGraph(WorkflowGraphState)
      .addNode(nodeName, node)
      .addEdge(START, nodeName)
      .addEdge(nodeName, END)
      .compile();
  }
}
