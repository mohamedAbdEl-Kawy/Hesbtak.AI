export type DocumentSide = 'vendor' | 'customer';

export type PaymentStatus = 'paid' | 'unpaid';

export type WorkflowReviewStep =
  | 'EXTRACTION'
  | 'CLASSIFICATION'
  | 'ACCOUNT_MAPPING'
  | 'JOURNAL'
  | 'PAYMENT';

export type WorkflowApiStatus =
  | 'PENDING'
  | 'WAITING_FOR_APPROVAL'
  | 'COMPLETED'
  | 'FAILED';

export interface InvoiceLineItem {
  description: string;
  quantity?: number;
  unitPrice?: number;
  taxAmount?: number;
  lineTotal?: number;
}

export interface ExtractionResult {
  invoiceNumber: string;
  vendorName: string;
  customerName: string;
  issueDate: string;
  dueDate: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: string;
  lineItems: InvoiceLineItem[];
}

export interface ClassificationResult {
  documentType: 'CUSTOMER_INVOICE' | 'VENDOR_BILL';
  accountingAction: 'REVENUE' | 'EXPENSE';
  requiresPayment: boolean;
  requiresCustomer: boolean;
  requiresVendor: boolean;
}

export interface DirectoryAccount {
  id: string;
  name: string;
  type?: string;
}

export interface DirectoryParty {
  id: string;
  name: string;
}

export interface MappingContext {
  accounts: DirectoryAccount[];
  customers: DirectoryParty[];
  vendors: DirectoryParty[];
}

export interface PartyProposal {
  action: 'USE_EXISTING' | 'CREATE';
  customerId?: string;
  vendorId?: string;
  customerName?: string;
  vendorName?: string;
}

export interface AccountMappingLine {
  lineDescription: string;
  accountId: string;
  accountName: string;
  confidence: number;
  reason?: string;
}

export interface AccountMappingResult {
  customerProposal: PartyProposal;
  vendorProposal: PartyProposal;
  accountMappings: AccountMappingLine[];
}

export interface JournalHeaderProposal {
  description: string;
  referenceType: string;
  date: string;
}

export interface JournalLineProposal {
  accountId: string;
  accountName: string;
  debit: number;
  credit: number;
  reason: string;
}

export interface JournalProposal {
  journalEntry: JournalHeaderProposal;
  lines: JournalLineProposal[];
}

export interface PaymentProposal {
  paymentRequired: boolean;
  paymentType: 'CUSTOMER_PAYMENT' | 'VENDOR_PAYMENT';
  amount: number;
  paymentDate: string;
  journalLines: JournalLineProposal[];
}

export interface WorkflowPayload {
  documentSide: DocumentSide;
  paymentStatus: PaymentStatus;
  extractionProposal?: ExtractionResult;
  approvedExtraction?: ExtractionResult;
  classificationProposal?: ClassificationResult;
  approvedClassification?: ClassificationResult;
  mappingContext?: MappingContext;
  accountMappingProposal?: AccountMappingResult;
  approvedAccountMapping?: AccountMappingResult;
  journalProposal?: JournalProposal;
  approvedJournal?: JournalProposal;
  paymentProposal?: PaymentProposal;
  approvedPayment?: PaymentProposal;
  errors?: string[];
}

export interface WaitingForApprovalResponse<T> {
  status: 'WAITING_FOR_APPROVAL';
  step: WorkflowReviewStep;
  data: T;
}

export interface CompletedWorkflowResponse {
  status: 'COMPLETED';
  step: 'COMPLETE';
  data: WorkflowPayload;
}
