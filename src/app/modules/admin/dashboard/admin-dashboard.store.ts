import { inject, Injectable, signal } from '@angular/core';
import { AppError } from '../../../core/errors/app-error';
import { AdminDashboardSummary, CollectorPerformanceEntry } from '../../../core/models/admin-dashboard.model';
import { ADMIN_DASHBOARD_REPOSITORY } from '../../../core/repositories/admin-dashboard.repository';

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

    try {
      const [summary, collectorPerformance] = await Promise.all([
        this.repository.getSummary(),
        this.repository.listCollectorPerformance(),
      ]);
      this.summary.set(summary);
      this.collectorPerformance.set(collectorPerformance);
    } catch (error) {
      this.error.set(AppError.from(error).message || 'No se pudo cargar el dashboard.');
    } finally {
      this.loading.set(false);
    }
  }
}
