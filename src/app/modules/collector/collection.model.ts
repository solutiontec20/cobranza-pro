export type CollectionRisk = 'current' | 'warning' | 'late' | 'defaulted' | 'paid';

export type CollectionFilter =
  | 'ALL'
  | 'DUE_TODAY'
  | 'PAID_TODAY'
  | 'NOT_PAID_TODAY'
  | 'OVERDUE'
  | 'DEFAULTED'
  | 'ACTIVE_LOANS'
  | 'PAID_LOANS';

export type CollectionSort =
  | 'MOST_OVERDUE'
  | 'LEAST_OVERDUE'
  | 'HIGHEST_BALANCE'
  | 'LOWEST_BALANCE'
  | 'NAME';

export interface CollectionClient {
  readonly id: string;
  readonly fullName: string;
  readonly dni: string;
  readonly phone: string;
  readonly address: string;
  readonly installmentAmount: number;
  readonly balance: number;
  readonly overdueDays: number;
  readonly risk: CollectionRisk;
  readonly hasDueToday: boolean;
  readonly paidToday: boolean;
  readonly collectedToday: number;
  readonly loanStatus: 'ACTIVE' | 'PAID';
}

export interface CollectionSummary {
  readonly dueToday: number;
  readonly expectedToday: number;
  readonly collectedToday: number;
  readonly overdueClients: number;
  readonly completionPercentage: number;
}
