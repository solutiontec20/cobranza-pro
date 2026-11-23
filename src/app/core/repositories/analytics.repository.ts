import { InjectionToken } from '@angular/core';
import {
  AnalyticsCollectorEntry,
  AnalyticsCollectorOption,
  AnalyticsExpenseCategoryEntry,
  AnalyticsFinancialPoint,
  AnalyticsQuery,
} from '../models/analytics.model';

export interface AnalyticsRepository {
  listCollectors(): Promise<AnalyticsCollectorOption[]>;
  getSeries(query: AnalyticsQuery, abortSignal?: AbortSignal): Promise<AnalyticsFinancialPoint[]>;
  /** Always covers every collector, so they can be compared even with a filter applied. */
  getCollectorPerformance(
    query: AnalyticsQuery,
    abortSignal?: AbortSignal,
  ): Promise<AnalyticsCollectorEntry[]>;
  getExpenseCategories(
    query: AnalyticsQuery,
    abortSignal?: AbortSignal,
  ): Promise<AnalyticsExpenseCategoryEntry[]>;
}

export const ANALYTICS_REPOSITORY = new InjectionToken<AnalyticsRepository>('ANALYTICS_REPOSITORY');
