import { LoanFrequency, LoanStatus } from './loan.model';

export type CorrectionRequestType = 'edit_loan' | 'void_loan' | 'void_payment';
export type CorrectionRequestStatus = 'pending' | 'resolved' | 'rejected';

export interface CorrectionRequest {
  id: string;
  requestType: CorrectionRequestType;
  status: CorrectionRequestStatus;
  loanId: string;
  paymentId: string | null;
  requestedBy: string;
  reason: string;
  proposedChanges: Record<string, unknown> | null;
  handledBy: string | null;
  handledAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
  customerId: string;
  customerName: string;
  customerDocument: string;
  collectorId: string;
  collectorName: string;
  loanStatus: LoanStatus;
  loanFrequency: LoanFrequency;
  loanStartedOn: string;
  loanPrincipal: number;
  loanInterestRate: number;
  loanInstallmentCount: number;
  loanTotal: number;
  paymentAmount: number | null;
  paymentDate: string | null;
  paymentStatus: 'posted' | 'voided' | null;
  paymentMethod: string | null;
}

export interface CreateCorrectionRequestInput {
  requestType: CorrectionRequestType;
  loanId: string;
  paymentId?: string | null;
  reason: string;
  proposedChanges?: Record<string, unknown> | null;
}

export interface CorrectionRequestReceipt {
  requestId: string;
  requestType: CorrectionRequestType;
  requestStatus: CorrectionRequestStatus;
  createdAt: string;
}

export interface CorrectionRequestResolution {
  requestId: string;
  requestStatus: CorrectionRequestStatus;
  handledAt: string;
}

export interface RejectCorrectionRequestInput {
  requestId: string;
  resolutionNote: string;
}

export interface ResolveEditLoanRequestInput {
  requestId: string;
  principal: number;
  interestRate: number;
  frequency: LoanFrequency;
  installmentCount: number;
  startedOn: string;
  reason: string;
}

export interface ResolveCorrectionRequestInput {
  requestId: string;
  resolutionNote: string;
}
