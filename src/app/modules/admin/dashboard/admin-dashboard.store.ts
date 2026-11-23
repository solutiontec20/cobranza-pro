import { inject, Injectable, signal } from '@angular/core';
import { AppError } from '../../../core/errors/app-error';
import {
  AdminDashboardSummary,
  CollectorPerformanceEntry,
  DashboardFinancialGranularity,
  DashboardFinancialPoint,
} from '../../../core/models/admin-dashboard.model';
import { ADMIN_DASHBOARD_REPOSITORY } from '../../../core/repositories/admin-dashboard.repository';
import { currentLimaDate } from '../../../core/calculations/date-time';

@Injectable()
export class AdminDashboardStore {
  private readonly repository = inject(ADMIN_DASHBOARD_REPOSITORY);

  readonly summary = signal<AdminDashboardSummary | null>(null);
  readonly collectorPerformance = signal<CollectorPerformanceEntry[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly financialGranularity = signal<DashboardFinancialGranularity>('daily');
  readonly referenceDate = signal(currentLimaDate());
  readonly financialSeries = signal<DashboardFinancialPoint[]>([]);
  readonly financialSeriesLoading = signal(false);
  readonly financialSeriesError = signal<string | null>(null);
  private financialSeriesRequestId = 0;

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    const [summaryResult, performanceResult] = await Promise.allSettled([
      this.repository.getSummary(),
      this.repository.listCollectorPerformance(),
      this.loadFinancialSeries(),
    ]).then((results) => [results[0], results[1]] as const);

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

  async setFinancialGranularity(granularity: DashboardFinancialGranularity): Promise<void> {
    if (this.financialGranularity() === granularity) return;
    this.financialGranularity.set(granularity);
    await this.loadFinancialSeries();
  }

  async setReferenceDate(referenceDate: string): Promise<void> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate) || this.referenceDate() === referenceDate) {
      return;
    }
    this.referenceDate.set(referenceDate);
    await this.loadFinancialSeries();
  }

  async loadFinancialSeries(): Promise<void> {
    const requestId = ++this.financialSeriesRequestId;
    this.financialSeriesLoading.set(true);
    this.financialSeriesError.set(null);

    try {
      const points = await this.repository.getFinancialSeries({
        granularity: this.financialGranularity(),
        referenceDate: this.referenceDate(),
      });
      if (requestId === this.financialSeriesRequestId) this.financialSeries.set(points);
    } catch (error) {
      if (requestId === this.financialSeriesRequestId) {
        this.financialSeriesError.set(
          AppError.from(error).message || 'No se pudo cargar la información financiera.',
        );
      }
    } finally {
      if (requestId === this.financialSeriesRequestId) this.financialSeriesLoading.set(false);
    }
  }
}
