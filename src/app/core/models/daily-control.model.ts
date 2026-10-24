export type DailyControlStatus = 'on_track' | 'overdue' | 'paid';

export type DailyControlStatusFilter = 'all' | DailyControlStatus;

export interface DailyControlFilters {
  businessDate: string;
  collectorId: string | null;
  status: DailyControlStatusFilter;
}

export interface DailyControlCollectorOption {
  id: string;
  fullName: string;
}

export interface DailyControlRow {
  loanId: string;
  clientId: string;
  clientDni: string;
  clientName: string;
  collectorId: string;
  collectorName: string;
  principalAmount: number;
  totalAmount: number;
  startedOn: string;
  endDate: string;
  installmentAmount: number;
  scheduledOnDate: number;
  collectedOnDate: number;
  paidToDate: number;
  balanceAsOf: number;
  oldestUnpaidDueDate: string | null;
  overdueDays: number;
  status: DailyControlStatus;
}

export interface DailyControlSummary {
  scheduledAmount: number;
  collectedAmount: number;
  operationalDifference: number;
  attendedClients: number;
  overdueClients: number;
}

export interface DailyControlReport {
  filters: DailyControlFilters;
  rows: DailyControlRow[];
  summary: DailyControlSummary;
  generatedAt: string;
}

export type DailyCashClosureStatus = 'draft' | 'submitted' | 'validated';

export type DailyPaymentMethod = 'cash' | 'yape';

export type DailyCashMovementDirection = 'inflow' | 'outflow';

export type DailyCashMovementType =
  | 'collection'
  | 'loan_disbursement'
  | 'payment_void'
  | 'adjustment';

export interface DailyCashMethodSummary {
  cash: number;
  yape: number;
  total: number;
}

export interface DailyCashMovement {
  id: string;
  happenedAt: string;
  direction: DailyCashMovementDirection;
  type: DailyCashMovementType;
  method: DailyPaymentMethod | null;
  amount: number;
  description: string;
}

export interface DailyCashClosure {
  id: string;
  businessDate: string;
  collectorId: string;
  collectorName: string;
  status: DailyCashClosureStatus;
  scheduledAmount: number;
  registeredAmount: number;
  methodSummary: DailyCashMethodSummary;
  expectedAmount: number;
  deliveredAmount: number | null;
  difference: number | null;
  observation: string | null;
  submittedAt: string | null;
  validatedAt: string | null;
  validatedBy: string | null;
  movements: DailyCashMovement[];
}

export interface SubmitDailyCashClosureInput {
  closureId: string;
  deliveredAmount: number;
  observation: string | null;
}

export interface ValidateDailyCashClosureInput {
  closureId: string;
  validatedBy: string;
  observation: string | null;
}

export type DailyControlExportFormat = 'csv' | 'xlsx' | 'pdf';

export interface DailyControlExportContext {
  generatedBy: string;
  collectorLabel: string;
  searchQuery: string;
}
