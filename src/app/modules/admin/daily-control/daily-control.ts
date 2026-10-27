import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
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

  protected readonly loadingRows = [1, 2, 3, 4, 5];
  protected readonly selectedDate = signal(parseDateValue(this.store.filters().businessDate));
  protected readonly exporting = signal<DailyControlExportFormat | null>(null);
  protected readonly exportError = signal<string | null>(null);

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
  }

  protected async changeDate(value: Date | null): Promise<void> {
    if (!value) return;
    this.selectedDate.set(value);
    await this.store.updateFilters({ businessDate: toIsoDateLima(value) });
  }

  protected async changeCollector(value: string | null): Promise<void> {
    await this.store.updateFilters({ collectorId: value });
  }

  protected async changeStatus(value: DailyControlStatusFilter): Promise<void> {
    await this.store.updateFilters({ status: value });
  }

  protected updateSearch(event: Event): void {
    this.store.query.set((event.target as HTMLInputElement).value);
  }

  protected async clearFilters(): Promise<void> {
    await this.store.clearFilters();
    this.selectedDate.set(parseDateValue(this.store.filters().businessDate));
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
}
