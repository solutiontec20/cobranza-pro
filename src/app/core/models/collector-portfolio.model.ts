import { LoanFrequency } from './loan.model';

/**
 * One row per customer in the authenticated collector's own portfolio, as returned by the
 * `collector_list_portfolio` RPC. `loanId`/loan-related fields are `null` when the customer has
 * no active loan right now (the RPC only reports the *active* loan, if any).
 */
export interface CollectorPortfolioEntry {
  customerId: string;
  dni: string;
  fullName: string;
  phone: string;
  address: string;
  notes: string;

  loanId: string | null;
  principal: number;
  interestRate: number;
  totalAmount: number;
  installmentCount: number;
  frequency: LoanFrequency | null;
  startedOn: string | null;
  firstDueOn: string | null;
  isLoanActive: boolean;

  remainingBalance: number;
  installmentAmount: number;
  todayScheduledAmount: number;
  todayOutstandingAmount: number;
  todayCollectedAmount: number;
  overdueDays: number;
}

export interface CreateCollectorClientInput {
  dni: string;
  fullName: string;
  phone: string;
  address: string;
  notes: string;

  principal: number;
  interestRate: number;
  frequency: LoanFrequency;
  installmentCount: number;
  startedOn: string;
}

export interface CreateCollectorClientResult {
  customerId: string;
  loanId: string;
  totalAmount: number;
  baseInstallmentAmount: number;
  lastInstallmentAmount: number;
  firstDueOn: string;
}

/**
 * Creates a loan for a customer who already exists in the collector's own portfolio but
 * currently has no renewable loan (never had one, or their only loan isn't active/paid).
 * Use `renew_loan`/`CollectorLoanStore.renew` instead when the customer has an active or fully
 * paid loan to link the new one to.
 */
export interface CreateCollectorLoanInput {
  customerId: string;
  principal: number;
  interestRate: number;
  frequency: LoanFrequency;
  installmentCount: number;
  startedOn: string;
}

export interface CreateCollectorLoanResult {
  loanId: string;
  customerId: string;
  totalAmount: number;
  disbursedAmount: number;
  baseInstallmentAmount: number;
  lastInstallmentAmount: number;
  firstDueOn: string;
}
