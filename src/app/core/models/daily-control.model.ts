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

export type DailyControlExportFormat = 'csv' | 'xlsx' | 'pdf';

export interface DailyControlExportContext {
  generatedBy: string;
  collectorLabel: string;
  searchQuery: string;
}
