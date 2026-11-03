import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, computed, inject, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PaginatorModule } from 'primeng/paginator';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { SortIcon, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { parseDateValue, toIsoDateLima } from '../../../core/calculations/date-time';
import {
  DailyControlExportFormat,
  DailyControlStatus,
  DailyControlStatusFilter,
} from '../../../core/models/daily-control.model';
import { EsDate } from '../../../shared/pipes/es-date';
import { PenCurrency } from '../../../shared/pipes/pen-currency';
import { AuthService } from '../../auth/auth.service';
import { DailyControlExportService } from './daily-control-export.service';
import { DailyControlStore } from './daily-control.store';

@Component({
  selector: 'app-daily-control',
  imports: [
    ButtonModule,
    DatePickerModule,
    EsDate,
    FormsModule,
    InputTextModule,
    MessageModule,
    PaginatorModule,
    PenCurrency,
    SelectModule,
    SkeletonModule,
    SortIcon,
    TableModule,
    TagModule,
  ],
  templateUrl: './daily-control.html',
})
export default class DailyControl {
  readonly store = inject(DailyControlStore);
  private readonly exportService = inject(DailyControlExportService);
  private readonly authService = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loadingRows = [1, 2, 3, 4, 5];
  protected readonly pageSizeOptions = [10, 20, 50];
  protected readonly first = signal(0);
  protected readonly rows = signal(10);
  protected readonly selectedDate = linkedSignal(() =>
    parseDateValue(this.store.filters().businessDate),
  );
  protected readonly exporting = signal<DailyControlExportFormat | null>(null);
  protected readonly exportError = signal<string | null>(null);
  protected readonly pageFirst = computed(() => {
    const total = this.store.visibleReport()?.rows.length ?? 0;
    if (total === 0) return 0;
    return Math.min(this.first(), Math.floor((total - 1) / this.rows()) * this.rows());
  });
  protected readonly paginatedRows = computed(() => {
    const rows = this.store.visibleReport()?.rows ?? [];
    const first = this.pageFirst();
    return rows.slice(first, first + this.rows());
  });

  protected readonly collectorOptions = computed(() => [
    { label: 'Todos los cobradores', value: null },
    ...this.store.collectors().map((collector) => ({
      label: collector.fullName,
      value: collector.id,
    })),
  ]);

  protected readonly statusOptions: Array<{
    label: string;
    value: DailyControlStatusFilter;
  }> = [
    { label: 'Todos los estados', value: 'all' },
    { label: 'Con atraso', value: 'overdue' },
    { label: 'Al día', value: 'on_track' },
    { label: 'Pagado', value: 'paid' },
  ];

  constructor() {
    void this.store.initialize();

    const refreshWhenVisible = (): void => {
      if (this.document.visibilityState === 'visible') {
        void this.store.refresh();
      }
    };

    this.document.addEventListener('visibilitychange', refreshWhenVisible);
    this.destroyRef.onDestroy(() => {
      this.document.removeEventListener('visibilitychange', refreshWhenVisible);
    });
  }

  protected changeDate(value: Date | null): void {
    if (!value) return;
    this.resetPage();
    this.store.updateFilters({ businessDate: toIsoDateLima(value) });
  }

  protected changeCollector(value: string | null): void {
    this.resetPage();
    this.store.updateFilters({ collectorId: value });
  }

  protected changeStatus(value: DailyControlStatusFilter): void {
    this.resetPage();
    this.store.updateFilters({ status: value });
  }

  protected updateSearch(event: Event): void {
    this.resetPage();
    this.store.query.set((event.target as HTMLInputElement).value);
  }

  protected clearFilters(): void {
    this.resetPage();
    this.store.clearFilters();
  }

  protected changePage(event: { first?: number; rows?: number }): void {
    this.first.set(event.first ?? 0);
    this.rows.set(event.rows ?? this.rows());
  }

  protected async exportReport(format: DailyControlExportFormat): Promise<void> {
    const report = this.store.visibleReport();
    if (!report) return;

    this.exportError.set(null);
    this.exporting.set(format);

    try {
      const selectedCollector = this.collectorOptions().find(
        (option) => option.value === this.store.filters().collectorId,
      );
      await this.exportService.export(format, report, {
        generatedBy: this.authService.currentUser()?.fullName ?? 'Administrador',
        collectorLabel: selectedCollector?.label ?? 'Todos los cobradores',
        searchQuery: this.store.query().trim(),
      });
    } catch (error) {
      this.exportError.set(
        error instanceof Error ? error.message : 'No se pudo generar el archivo.',
      );
    } finally {
      this.exporting.set(null);
    }
  }

  protected statusLabel(status: DailyControlStatus): string {
    return { on_track: 'Al día', overdue: 'Con atraso', paid: 'Pagado' }[status];
  }

  protected statusSeverity(status: DailyControlStatus): 'success' | 'danger' | 'secondary' {
    if (status === 'overdue') return 'danger';
    if (status === 'paid') return 'secondary';
    return 'success';
  }

  private resetPage(): void {
    this.first.set(0);
  }
}
