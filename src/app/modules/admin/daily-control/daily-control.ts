import { CurrencyPipe } from '@angular/common';
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
import { TextareaModule } from 'primeng/textarea';
import {
  DailyCashClosureStatus,
  DailyCashMovement,
  DailyControlExportFormat,
  DailyControlStatus,
  DailyControlStatusFilter,
} from '../../../core/models/daily-control.model';
import { AuthService } from '../../auth/auth.service';
import { DailyControlExportService } from './daily-control-export.service';
import { DailyControlStore } from './daily-control.store';

@Component({
  selector: 'app-daily-control',
  imports: [
    ButtonModule,
    CurrencyPipe,
    DatePickerModule,
    FormsModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    SkeletonModule,
    SortIcon,
    TableModule,
    TagModule,
    TextareaModule,
  ],
  templateUrl: './daily-control.html',
})
export default class DailyControl {
  readonly store = inject(DailyControlStore);
  private readonly exportService = inject(DailyControlExportService);
  private readonly authService = inject(AuthService);

  protected readonly loadingRows = [1, 2, 3, 4, 5];
  protected readonly selectedDate = signal(dateFromIso(this.store.filters().businessDate));
  protected readonly exporting = signal<DailyControlExportFormat | null>(null);
  protected readonly exportError = signal<string | null>(null);
  protected readonly validationObservation = signal('');

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
    await this.store.updateFilters({ businessDate: toIsoDate(value) });
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
    this.selectedDate.set(dateFromIso(this.store.filters().businessDate));
  }

  protected async focusClosure(closureId: string): Promise<void> {
    this.validationObservation.set('');
    await this.store.focusClosure(closureId);
  }

  protected async validateClosure(): Promise<void> {
    const validated = await this.store.validateSelected(
      this.authService.currentUser()?.fullName ?? 'Administrador',
      this.validationObservation().trim() || null,
    );
    if (validated) this.validationObservation.set('');
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

  protected formatDate(value: string | null): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(dateFromIso(value));
  }

  protected statusLabel(status: DailyControlStatus): string {
    return { on_track: 'Al día', overdue: 'Con atraso', paid: 'Pagado' }[status];
  }

  protected statusSeverity(status: DailyControlStatus): 'success' | 'danger' | 'secondary' {
    if (status === 'overdue') return 'danger';
    if (status === 'paid') return 'secondary';
    return 'success';
  }

  protected closureStatusLabel(status: DailyCashClosureStatus): string {
    return { draft: 'Borrador', submitted: 'Enviado', validated: 'Validado' }[status];
  }

  protected closureStatusSeverity(
    status: DailyCashClosureStatus,
  ): 'secondary' | 'warn' | 'success' {
    if (status === 'submitted') return 'warn';
    if (status === 'validated') return 'success';
    return 'secondary';
  }

  protected movementLabel(movement: DailyCashMovement): string {
    if (movement.type === 'loan_disbursement') return 'Desembolso';
    if (movement.type === 'payment_void') return 'Anulación de cobro';
    if (movement.type === 'adjustment') return 'Ajuste';
    return movement.method === 'cash' ? 'Cobro en efectivo' : 'Cobro por Yape';
  }

  protected formatDateTime(value: string | null): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('es-PE', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Lima',
    }).format(new Date(value));
  }
}

function dateFromIso(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function toIsoDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const record = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${record['year']}-${record['month']}-${record['day']}`;
}
