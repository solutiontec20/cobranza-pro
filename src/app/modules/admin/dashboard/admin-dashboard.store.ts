import { inject, Injectable, signal } from '@angular/core';
import { AppError } from '../../../core/errors/app-error';
import {
  AdminDashboardSummary,
  CollectorPerformanceEntry,
} from '../../../core/models/admin-dashboard.model';
import { ADMIN_DASHBOARD_REPOSITORY } from '../../../core/repositories/admin-dashboard.repository';

/**
 * Operational snapshot of the business right now. Historical and comparative analysis lives in
 * the lazy Analíticas module so this screen never runs analytical queries.
 */
@Injectable()
export class AdminDashboardStore {
  private readonly repository = inject(ADMIN_DASHBOARD_REPOSITORY);

  readonly summary = signal<AdminDashboardSummary | null>(null);
  readonly collectorPerformance = signal<CollectorPerformanceEntry[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    const [summaryResult, performanceResult] = await Promise.allSettled([
      this.repository.getSummary(),
      this.repository.listCollectorPerformance(),
    ]);

    if (summaryResult.status === 'fulfilled') this.summary.set(summaryResult.value);
    if (performanceResult.status === 'fulfilled') {
      this.collectorPerformance.set(performanceResult.value);
    }

    if (summaryResult.status === 'rejected' || performanceResult.status === 'rejected') {
      const failure =
        summaryResult.status === 'rejected'
          ? summaryResult.reason
          : performanceResult.status === 'rejected'
            ? performanceResult.reason
            : undefined;
      this.error.set(AppError.from(failure).message || 'No se pudo cargar el dashboard.');
    }
    this.loading.set(false);
  }
}
