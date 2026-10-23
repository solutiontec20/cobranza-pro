import { computed, inject, Injectable, signal } from '@angular/core';
import { AppError } from '../../../core/errors/app-error';
import {
  DailyCashClosure,
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
  readonly closures = signal<DailyCashClosure[]>([]);
  readonly selectedClosureId = signal<string | null>(null);
  readonly report = signal<DailyControlReport | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly selectedClosure = computed(() => {
    const id = this.selectedClosureId();
    return this.closures().find((closure) => closure.id === id) ?? null;
  });

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
      const [collectors, report, closures] = await Promise.all([
        this.repository.listCollectors(),
        this.repository.getReport(this.filters()),
        this.repository.listClosures(this.filters().businessDate),
      ]);
      this.collectors.set(collectors);
      this.report.set(report);
      this.setClosures(closures);
    } catch (error) {
      this.error.set(this.messageFrom(error));
    } finally {
      this.loading.set(false);
    }
  }

  async updateFilters(patch: Partial<DailyControlFilters>): Promise<void> {
    const businessDateChanged =
      patch.businessDate !== undefined && patch.businessDate !== this.filters().businessDate;
    this.filters.update((filters) => ({ ...filters, ...patch }));
    await this.loadWorkspace(businessDateChanged);
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

  async focusClosure(closureId: string): Promise<void> {
    const closure = this.closures().find((item) => item.id === closureId);
    if (!closure) return;

    this.selectedClosureId.set(closureId);
    if (this.filters().collectorId !== closure.collectorId) {
      await this.updateFilters({ collectorId: closure.collectorId });
    }
  }

  async validateSelected(validatedBy: string, observation: string | null): Promise<boolean> {
    const closure = this.selectedClosure();
    if (!closure || closure.status !== 'submitted') return false;

    this.saving.set(true);
    this.error.set(null);
    try {
      const updated = await this.repository.validateClosure({
        closureId: closure.id,
        validatedBy,
        observation,
      });
      this.closures.update((closures) =>
        closures.map((item) => (item.id === updated.id ? updated : item)),
      );
      return true;
    } catch (error) {
      this.error.set(this.messageFrom(error));
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  private async loadWorkspace(loadClosures = true): Promise<void> {
    const requestId = ++this.requestSequence;
    this.loading.set(true);
    this.error.set(null);

    try {
      const [report, closures] = await Promise.all([
        this.repository.getReport(this.filters()),
        loadClosures
          ? this.repository.listClosures(this.filters().businessDate)
          : Promise.resolve(null),
      ]);
      if (requestId === this.requestSequence) {
        this.report.set(report);
        if (closures) this.setClosures(closures);
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

  private setClosures(closures: DailyCashClosure[]): void {
    this.closures.set(closures);
    const selectedId = this.selectedClosureId();
    const selectedStillExists = closures.some((closure) => closure.id === selectedId);
    if (!selectedStillExists) {
      const collectorId = this.filters().collectorId;
      this.selectedClosureId.set(
        closures.find((closure) => closure.collectorId === collectorId)?.id ??
          closures.find((closure) => closure.status === 'submitted')?.id ??
          closures[0]?.id ??
          null,
      );
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
