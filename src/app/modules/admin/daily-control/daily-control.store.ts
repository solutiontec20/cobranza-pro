import { computed, inject, Injectable, resource, signal } from '@angular/core';
import { currentLimaDate } from '../../../core/calculations/date-time';
import { roundMoney } from '../../../core/calculations/money';
import { normalizeSearchText } from '../../../core/calculations/text';
import { AppError } from '../../../core/errors/app-error';
import {
  DailyControlFilters,
  DailyControlReport,
  DailyControlRow,
  DailyControlSummary,
} from '../../../core/models/daily-control.model';
import { DAILY_CONTROL_REPOSITORY } from '../../../core/repositories/daily-control.repository';

@Injectable()
export class DailyControlStore {
  private readonly repository = inject(DAILY_CONTROL_REPOSITORY);
  private readonly collectorsLoading = signal(false);
  private readonly collectorsError = signal<string | null>(null);

  readonly filters = signal<DailyControlFilters>({
    businessDate: currentLimaDate(),
    collectorId: null,
    status: 'all',
  });
  readonly query = signal('');
  readonly collectors = signal<Array<{ id: string; fullName: string }>>([]);
  private readonly reportResource = resource({
    params: () => this.filters(),
    loader: ({ params, abortSignal }) => this.repository.getReport(params, abortSignal),
  });

  readonly report = computed<DailyControlReport | null>(
    () => (this.reportResource.hasValue() ? this.reportResource.value() : null),
  );
  readonly loading = computed(() => this.collectorsLoading() || this.reportResource.isLoading());
  readonly error = computed<string | null>(() => {
    const reportError = this.reportResource.error();
    if (reportError) return this.messageFrom(reportError);
    return this.collectorsError();
  });

  readonly visibleReport = computed<DailyControlReport | null>(() => {
    const report = this.report();
    if (!report) return null;

    const query = normalizeSearchText(this.query());
    if (!query) return report;

    const rows = report.rows.filter((row) =>
      [row.clientName, row.clientDni, row.collectorName]
        .map(normalizeSearchText)
        .some((value) => value.includes(query)),
    );

    return { ...report, rows, summary: summarize(rows) };
  });

  async initialize(): Promise<void> {
    this.collectorsLoading.set(true);
    this.collectorsError.set(null);

    try {
      this.collectors.set(await this.repository.listCollectors());
    } catch (error) {
      this.collectorsError.set(this.messageFrom(error));
    } finally {
      this.collectorsLoading.set(false);
    }
  }

  updateFilters(patch: Partial<DailyControlFilters>): void {
    this.filters.update((filters) => ({ ...filters, ...patch }));
  }

  clearFilters(): void {
    this.query.set('');
    this.filters.set({
      businessDate: currentLimaDate(),
      collectorId: null,
      status: 'all',
    });
  }

  reload(): void {
    this.reportResource.reload();
  }

  async refresh(): Promise<void> {
    this.reload();
    await this.initialize();
  }

  private messageFrom(error: unknown): string {
    return AppError.from(error).message || 'No se pudo cargar el control diario.';
  }
}

function summarize(rows: DailyControlRow[]): DailyControlSummary {
  const scheduledAmount = roundMoney(rows.reduce((total, row) => total + row.scheduledOnDate, 0));
  const collectedAmount = roundMoney(rows.reduce((total, row) => total + row.collectedOnDate, 0));
  return {
    scheduledAmount,
    collectedAmount,
    operationalDifference: roundMoney(scheduledAmount - collectedAmount),
    attendedClients: rows.filter((row) => row.collectedOnDate > 0).length,
    overdueClients: rows.filter((row) => row.status === 'overdue').length,
  };
}
