import { CashExpenseCategory } from './cash-closure.model';

/** What the user picks: one exact day/week/month/year, or a free date range. */
export type AnalyticsPreset = 'day' | 'week' | 'month' | 'year' | 'custom';

/** Size of every point of the evolution charts. Chosen from the range, never by the user. */
export type AnalyticsBucket = 'day' | 'week' | 'month' | 'year';

/** Inclusive Lima business dates (`YYYY-MM-DD`). */
export interface AnalyticsRange {
  start: string;
  end: string;
}

export interface AnalyticsQuery extends AnalyticsRange {
  bucket: AnalyticsBucket;
  /** Restrict every figure to one collector, or null for the whole business. */
  collectorId: string | null;
}

/**
 * One point of the series. Every amount is a **flow**: movements that happened inside
 * `bucketStart`..`bucketEnd` (both inclusive). They are never end-of-period snapshots.
 */
export interface AnalyticsFinancialPoint {
  bucketStart: string;
  bucketEnd: string;
  collectedAmount: number;
  interestCollected: number;
  loanDisbursements: number;
  operatingExpenses: number;
  netProfit: number;
  paymentsCount: number;
}

export interface AnalyticsFinancialTotals {
  collectedAmount: number;
  interestCollected: number;
  loanDisbursements: number;
  operatingExpenses: number;
  netProfit: number;
  paymentsCount: number;
}

/** How one collector performed inside the range. */
export interface AnalyticsCollectorEntry {
  collectorId: string;
  name: string;
  dni: string;
  collectedAmount: number;
  interestCollected: number;
  paymentsCount: number;
  clientsAttended: number;
  loanDisbursements: number;
  operatingExpenses: number;
  netProfit: number;
}

export interface AnalyticsExpenseCategoryEntry {
  category: CashExpenseCategory;
  expenseCount: number;
  spentAmount: number;
}

export interface AnalyticsCollectorOption {
  id: string;
  fullName: string;
}

export interface AnalyticsReport {
  series: AnalyticsFinancialPoint[];
  collectors: AnalyticsCollectorEntry[];
  categories: AnalyticsExpenseCategoryEntry[];
}
