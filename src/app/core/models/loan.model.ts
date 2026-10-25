export type LoanStatus =
  | 'active'
  | 'paid'
  | 'renewed'
  | 'voided';

export type LoanFrequency =
  | 'daily'
  | 'weekly'
  | 'monthly';

export type LoanInstallmentStatus =
  | 'pending'
  | 'partial'
  | 'overdue'
  | 'paid';

export type LoanPaymentMethod =
  | 'cash'
  | 'yape'
  | 'plin'
  | 'transfer';

export interface Loan {
  id: string;
  clientId: string;

  principal: number;
  interestRate: number;
  totalAmount: number;
  disbursedAmount: number;

  installmentCount: number;
  frequency: LoanFrequency;

  startedOn: string;
  firstDueOn: string;

  status: LoanStatus;
  createdAt: string;
}

export interface LoanListItem {
  id: string;

  clientId: string;
  clientName: string;

  collectorId: string;
  collectorName: string;

  principal: number;
  interestRate: number;
  totalAmount: number;

  installmentAmount: number;
  installmentCount: number;

  frequency: LoanFrequency;

  balance: number;
  status: LoanStatus;

  startedOn: string;
  endDate: string;
  createdAt: string;
}

export interface LoanClientOption {
  id: string;
  dni: string;
  fullName: string;

  collectorId: string;
  collectorName: string;
}

export interface LoanInstallment {
  id: string;
  loanId: string;
  installmentNumber: number;
  dueDate: string;
  scheduledAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  status: LoanInstallmentStatus;
  overdueDays: number;
}

export interface LoanDetailClient {
  id: string;
  dni: string;
  fullName: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  collectorId: string;
  collectorName: string;
}

export interface LoanPaymentRecord {
  id: string;
  amount: number;
  paymentMethod: string;
  paidAt: string;
  businessDate: string;
  status: 'posted' | 'voided';
  notes: string | null;
  collectorId: string;
  collectorName: string;
  voidReason: string | null;
}

export interface LoanDetail {
  loan: LoanListItem;
  client: LoanDetailClient;
  installments: LoanInstallment[];
  payments: LoanPaymentRecord[];
}

export interface CreateLoanInput {
  clientId: string;
  principal: number;
  interestRate: number;

  frequency: LoanFrequency;
  installmentCount: number;

  startedOn: string;
  firstDueOn: string;
}

export interface UpdateLoanInput {
  loanId: string;
  principal: number;
  interestRate: number;

  frequency: LoanFrequency;
  installmentCount: number;

  startedOn: string;
  reason: string;
}

export interface RenewLoanInput {
  loanId: string;
  principal: number;
  interestRate: number;

  frequency: LoanFrequency;
  installmentCount: number;

  startedOn: string;
}

export interface RenewLoanResult {
  loanId: string;
  clientId: string;
  previousLoanId: string;
  totalAmount: number;
  disbursedAmount: number;
  baseInstallmentAmount: number;
  lastInstallmentAmount: number;
  firstDueOn: string;
}

export interface RegisterLoanPaymentInput {
  loanId: string;
  amount: number;
  paymentMethod: LoanPaymentMethod;
  notes: string;
}

export interface RegisterLoanPaymentResult {
  paymentId: string;
  allocatedAmount: number;
  remainingBalance: number;
  resultingLoanStatus: LoanStatus;
}
