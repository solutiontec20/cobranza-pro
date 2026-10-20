export type LoanStatus =
  | 'active'
  | 'paid'
  | 'renewed'
  | 'voided';

export type LoanFrequency =
  | 'daily'
  | 'weekly'
  | 'monthly';

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

export interface CreateLoanInput {
  clientId: string;
  principal: number;
  interestRate: number;

  frequency: LoanFrequency;
  installmentCount: number;

  startedOn: string;
  firstDueOn: string;
}
