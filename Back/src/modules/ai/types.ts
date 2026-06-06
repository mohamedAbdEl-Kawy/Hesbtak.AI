export type DocumentSide = 'vendor' | 'customer';
export type PaymentStatus = 'paid' | 'unpaid';

export type WorkflowReviewStep =
  | 'EXTRACTION'
  | 'CLASSIFICATION'
  | 'ACCOUNT_MAPPING'
  | 'JOURNAL'
  | 'PAYMENT';

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

export interface JournalLineProposal {
  accountId: string;
  accountName: string;
  debit: number;
  credit: number;
  reason: string;
}

export interface JournalProposal {
  journalEntry: {
    description: string;
    referenceType: string;
    date: string;
  };
  lines: JournalLineProposal[];
}

export interface PaymentProposal {
  paymentRequired: boolean;
  paymentType: 'CUSTOMER_PAYMENT' | 'VENDOR_PAYMENT';
  amount: number;
  paymentDate: string;
  journalLines: JournalLineProposal[];
}

export type SystemApprovalStep =
  | 'EXTRACTION'
  | 'CLASSIFICATION'
  | 'ACCOUNT_MAPPING'
  | 'JOURNAL'
  | 'PAYMENT';

export interface SystemApprovalRecord {
  step: SystemApprovalStep;
  approved: boolean;
  checkedAt: string;
  rules: string[];
}

export interface PersistedWorkflowRecords {
  customerId?: string;
  vendorId?: string;
  invoiceId?: string;
  vendorBillId?: string;
  paymentId?: string;
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
  systemApprovals?: SystemApprovalRecord[];
  persistedRecords?: PersistedWorkflowRecords;
  automationError?: string;
}
