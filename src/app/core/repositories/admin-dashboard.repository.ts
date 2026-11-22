import { InjectionToken } from '@angular/core';
import {
  AdminDashboardSummary,
  CollectorPerformanceEntry,
  DashboardFinancialPoint,
  DashboardFinancialSeriesQuery,
} from '../models/admin-dashboard.model';

export interface AdminDashboardRepository {
  getSummary(): Promise<AdminDashboardSummary>;
  listCollectorPerformance(): Promise<CollectorPerformanceEntry[]>;
  getFinancialSeries(query: DashboardFinancialSeriesQuery): Promise<DashboardFinancialPoint[]>;
}

export const ADMIN_DASHBOARD_REPOSITORY = new InjectionToken<AdminDashboardRepository>(
  'ADMIN_DASHBOARD_REPOSITORY',
);
