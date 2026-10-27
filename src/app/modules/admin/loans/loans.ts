import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { form, FormField, max, min, required, submit, validate } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { LoanFrequency, LoanStatus } from '../../../core/models/loan.model';
import { EsDate } from '../../../shared/pipes/es-date';
import { PenCurrency } from '../../../shared/pipes/pen-currency';
import { calculateLoanSummary, firstDueOn, toDateInput } from './loan-calculations';
import { LoanFrequencyFilter, LoanStatusFilter, LoansStore } from './loans.store';

interface LoanFormModel {
  clientId: string;
  principal: number;
  interestRate: number;
  frequency: LoanFrequency;
  installmentCount: number;
  startedOn: string;
}

const emptyModel = (): LoanFormModel => ({
  clientId: '',
  principal: 100,
  interestRate: 20,
  frequency: 'daily',
  installmentCount: 24,
  startedOn: toDateInput(new Date()),
});

@Component({
  selector: 'app-admin-loans',
  imports: [
    ButtonModule,
    DialogModule,
    EsDate,
    FormField,
    FormsModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    PenCurrency,
    RouterLink,
    SelectModule,
    SkeletonModule,
    TableModule,
    TagModule,
  ],
  templateUrl: `./loans.html`,
})
export default class Loans {
  protected readonly store = inject(LoansStore);
  private readonly messageService = inject(MessageService);

  protected readonly loadingRows = [1, 2, 3];
  protected readonly createDialogVisible = signal(false);
  protected readonly frequencyOptions: Array<{ label: string; value: LoanFrequency }> = [
    { label: 'Diario', value: 'daily' },
    { label: 'Semanal', value: 'weekly' },
    { label: 'Mensual', value: 'monthly' },
  ];
  protected readonly statusOptions: Array<{ label: string; value: LoanStatusFilter }> = [
    { label: 'Todos los estados', value: 'all' },
    { label: 'Activo', value: 'active' },
    { label: 'Pagado', value: 'paid' },
    { label: 'Renovado', value: 'renewed' },
    { label: 'Anulado', value: 'voided' },
  ];
  protected readonly frequencyFilterOptions: Array<{ label: string; value: LoanFrequencyFilter }> = [
    { label: 'Todas las frecuencias', value: 'all' },
    { label: 'Diario', value: 'daily' },
    { label: 'Semanal', value: 'weekly' },
    { label: 'Mensual', value: 'monthly' },
  ];
  protected readonly collectorFilterOptions = computed(() => [
    { label: 'Todos los cobradores', value: null },
    ...this.store.collectorOptions().map((collector) => ({
      label: collector.fullName,
      value: collector.id,
    })),
  ]);

  protected readonly loanModel = signal<LoanFormModel>(emptyModel());
  protected readonly loanForm = form(this.loanModel, (path) => {
    required(path.clientId, { message: 'Selecciona un cliente.' });
    min(path.principal, 0.01, { message: 'El capital debe ser mayor que cero.' });
    min(path.interestRate, 0, { message: 'La tasa no puede ser negativa.' });
    min(path.installmentCount, 1, { message: 'Debe existir al menos una cuota.' });
    max(path.installmentCount, 32767, { message: 'La cantidad de cuotas es demasiado alta.' });
    required(path.startedOn, { message: 'Selecciona la fecha de inicio.' });
    validate(path.installmentCount, ({ valueOf }) => {
      const summary = calculateLoanSummary(
        valueOf(path.principal),
        valueOf(path.interestRate),
        valueOf(path.installmentCount),
      );
      return summary.baseInstallmentAmount > 0 && summary.lastInstallmentAmount > 0
        ? undefined
        : { kind: 'invalidSchedule', message: 'La cantidad de cuotas genera importes inválidos.' };
    });
  });

  protected readonly summary = computed(() => {
    const model = this.loanModel();
    return calculateLoanSummary(model.principal, model.interestRate, model.installmentCount);
  });
  protected readonly firstDueDate = computed(() => {
    const model = this.loanModel();
    return firstDueOn(model.startedOn, model.frequency);
  });
  protected readonly clientOptions = computed(() =>
    this.store.availableClients().map((client) => ({
      label: `${client.dni} · ${client.fullName} — ${client.collectorName}`,
      value: client.id,
    })),
  );

  constructor() {
    void this.store.load();
  }

  protected updateSearch(event: Event): void {
    this.store.query.set((event.target as HTMLInputElement).value);
  }

  protected openCreateDialog(): void {
    this.store.clearError();
    this.loanModel.set(emptyModel());
    this.loanForm().reset();
    this.createDialogVisible.set(true);
  }

  protected createLoan(): void {
    void submit(this.loanForm, async () => {
      const model = this.loanModel();
      const created = await this.store.create({
        clientId: model.clientId,
        principal: model.principal,
        interestRate: model.interestRate,
        frequency: model.frequency,
        installmentCount: model.installmentCount,
        startedOn: model.startedOn,
        firstDueOn: firstDueOn(model.startedOn, model.frequency),
      });

      if (created) {
        this.createDialogVisible.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Préstamo creado',
          detail: 'El préstamo y su cronograma fueron registrados correctamente.',
        });
      }
    });
  }

  protected frequencyLabel(frequency: LoanFrequency): string {
    return this.frequencyOptions.find((option) => option.value === frequency)?.label ?? frequency;
  }

  protected statusLabel(status: LoanStatus): string {
    return { active: 'Activo', paid: 'Pagado', renewed: 'Renovado', voided: 'Anulado' }[status];
  }
}
