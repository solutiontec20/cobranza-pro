import { computed, inject, Injectable, signal } from '@angular/core';
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
  private requestSequence = 0;

  readonly filters = signal<DailyControlFilters>({
    businessDate: currentLimaDate(),
    collectorId: null,
    status: 'all',
  });
  readonly query = signal('');
  readonly collectors = signal<Array<{ id: string; fullName: string }>>([]);
  readonly report = signal<DailyControlReport | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly visibleReport = computed<DailyControlReport | null>(() => {
    const report = this.report();
    if (!report) return null;

    const query = normalize(this.query());
    if (!query) return report;

    const rows = report.rows.filter((row) =>
      [row.clientName, row.clientDni, row.collectorName]
        .map(normalize)
        .some((value) => value.includes(query)),
    );

    return { ...report, rows, summary: summarize(rows) };
  });

  async initialize(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const [collectors, report] = await Promise.all([
        this.repository.listCollectors(),
        this.repository.getReport(this.filters()),
      ]);
      this.collectors.set(collectors);
      this.report.set(report);
    } catch (error) {
      this.error.set(this.messageFrom(error));
    } finally {
      this.loading.set(false);
    }
  }

  async updateFilters(patch: Partial<DailyControlFilters>): Promise<void> {
    this.filters.update((filters) => ({ ...filters, ...patch }));
    await this.loadWorkspace();
  }

  async clearFilters(): Promise<void> {
    this.query.set('');
    this.filters.set({
      businessDate: currentLimaDate(),
      collectorId: null,
      status: 'all',
    });
    await this.loadWorkspace();
  }

  async reload(): Promise<void> {
    await this.loadWorkspace();
  }

  private async loadWorkspace(): Promise<void> {
    const requestId = ++this.requestSequence;
    this.loading.set(true);
    this.error.set(null);

    try {
      const report = await this.repository.getReport(this.filters());
      if (requestId === this.requestSequence) {
        this.report.set(report);
      }
    } catch (error) {
      if (requestId === this.requestSequence) {
        this.error.set(this.messageFrom(error));
      }
    } finally {
      if (requestId === this.requestSequence) {
        this.loading.set(false);
      }
    }
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

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-PE')
    .trim();
}

function currentLimaDate(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value['year']}-${value['month']}-${value['day']}`;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
