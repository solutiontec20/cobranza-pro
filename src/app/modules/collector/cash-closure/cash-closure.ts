import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  form,
  FormField,
  maxLength,
  min,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PaginatorModule } from 'primeng/paginator';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { calculateTotalCollected } from '../../../core/calculations/cash-closure-calculations';
import { pageItems } from '../../../core/calculations/loan-detail-filtering';
import {
  CashAllowanceRequest,
  CashExpense,
  CashExpenseCategory,
} from '../../../core/models/cash-closure.model';
import { EsDate } from '../../../shared/pipes/es-date';
import { PenCurrency } from '../../../shared/pipes/pen-currency';
import { CollectorCashClosureStore } from './collector-cash-closure.store';

interface ExpenseFormModel {
  category: CashExpenseCategory;
  amount: number;
  description: string;
}

interface AllowanceFormModel {
  amount: number;
  notes: string;
}

interface SubmitFormModel {
  deliveredAmount: number;
  observation: string;
}

const emptyExpenseModel = (): ExpenseFormModel => ({
  category: 'fuel',
  amount: 0,
  description: '',
});
const emptyAllowanceModel = (): AllowanceFormModel => ({ amount: 0, notes: '' });

const CATEGORY_OPTIONS: Array<{ label: string; value: CashExpenseCategory }> = [
  { label: 'Combustible', value: 'fuel' },
  { label: 'Peajes', value: 'tolls' },
  { label: 'Pasajes', value: 'fares' },
  { label: 'Estacionamiento', value: 'parking' },
  { label: 'Alimentación', value: 'meals' },
  { label: 'Otros', value: 'other' },
];

@Component({
  selector: 'app-collector-cash-closure',
  imports: [
    ButtonModule,
    DialogModule,
    EsDate,
    FormField,
    FormsModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    PaginatorModule,
    PenCurrency,
    SelectModule,
    SkeletonModule,
    TagModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './cash-closure.html',
})
export default class CollectorCashClosure {
  protected readonly store = inject(CollectorCashClosureStore);
  private readonly messageService = inject(MessageService);

  protected readonly loadingRows = [1, 2, 3];
  protected readonly categoryOptions = CATEGORY_OPTIONS;
  protected readonly today = new Date();
  protected readonly expenseStatusFilter = signal<CashExpense['status'] | 'all'>('all');
  protected readonly expenseStatusOptions = [
    { label: 'Todos los estados', value: 'all' as const },
    { label: 'Pendientes', value: 'pending' as const },
    { label: 'Aprobados', value: 'approved' as const },
    { label: 'Rechazados', value: 'rejected' as const },
  ];
  protected readonly expensePageSizeOptions = [5, 10, 20];
  protected readonly expensePageFirst = signal(0);
  protected readonly expensePageRows = signal(5);

  protected readonly totalCollected = computed(() => {
    const day = this.store.day();
    return day ? calculateTotalCollected(day.breakdown) : 0;
  });
  protected readonly digitalCollected = computed(() => {
    const day = this.store.day();
    return day ? this.totalCollected() - day.breakdown.cashCollectedAmount : 0;
  });
  protected readonly filteredExpenses = computed(() => {
    const status = this.expenseStatusFilter();
    const expenses = this.store.day()?.expenses ?? [];
    return status === 'all' ? expenses : expenses.filter((expense) => expense.status === status);
  });
  protected readonly visibleExpenses = computed(() =>
    pageItems(this.filteredExpenses(), this.expensePageFirst(), this.expensePageRows()),
  );

  protected readonly pendingAllowanceRequest = computed(() =>
    this.store.day()?.allowanceRequests.find((request) => request.status === 'pending'),
  );

  // Request allowance dialog
  protected readonly allowanceDialogVisible = signal(false);
  protected readonly allowanceModel = signal<AllowanceFormModel>(emptyAllowanceModel());
  protected readonly allowanceForm = form(this.allowanceModel, (path) => {
    min(path.amount, 0.01, { message: 'El monto debe ser mayor que cero.' });
    required(path.notes, { message: 'Ingresá para qué necesitás el viático.' });
    maxLength(path.notes, 300, { message: 'La justificación no puede superar 300 caracteres.' });
  });

  // Request expense dialog
  protected readonly expenseDialogVisible = signal(false);
  protected readonly expenseModel = signal<ExpenseFormModel>(emptyExpenseModel());
  protected readonly expenseForm = form(this.expenseModel, (path) => {
    required(path.category, { message: 'Seleccioná la categoría.' });
    min(path.amount, 0.01, { message: 'El monto debe ser mayor que cero.' });
    maxLength(path.description, 300, {
      message: 'La descripción no puede superar 300 caracteres.',
    });
  });

  // Submit closure dialog
  protected readonly submitDialogVisible = signal(false);
  protected readonly submitModel = signal<SubmitFormModel>({ deliveredAmount: 0, observation: '' });
  protected readonly submitForm = form(this.submitModel, (path) => {
    min(path.deliveredAmount, 0, { message: 'El monto no puede ser negativo.' });
    maxLength(path.observation, 300, {
      message: 'La observación no puede superar 300 caracteres.',
    });
    validate(path.observation, ({ valueOf }) => {
      const expected = this.store.expectedCash();
      const delivered = valueOf(path.deliveredAmount);
      return delivered !== expected && valueOf(path.observation).trim().length === 0
        ? { kind: 'required', message: 'Ingresá una observación: el monto difiere del esperado.' }
        : undefined;
    });
  });
  protected readonly submitDifference = computed(() => {
    const expected = this.store.expectedCash();
    return Math.round((this.submitModel().deliveredAmount - expected) * 100) / 100;
  });

  constructor() {
    void this.store.load();
  }

  // ----------------------------------------------------------------
  // Request allowance
  // ----------------------------------------------------------------

  protected openAllowanceDialog(): void {
    this.store.clearError();
    this.allowanceModel.set(emptyAllowanceModel());
    this.allowanceForm().reset();
    this.allowanceDialogVisible.set(true);
  }

  protected submitAllowance(): void {
    void submit(this.allowanceForm, async () => {
      const model = this.allowanceModel();
      const ok = await this.store.requestAllowance({
        amount: model.amount,
        notes: model.notes.trim(),
      });

      if (ok) {
        this.allowanceDialogVisible.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Viático solicitado',
          detail: 'Quedó pendiente de aprobación del administrador o supervisor.',
        });
      } else if (this.store.error()) {
        this.messageService.add({
          severity: 'error',
          summary: 'No se pudo solicitar',
          detail: this.store.error() ?? '',
        });
      }
    });
  }

  // ----------------------------------------------------------------
  // Request expense
  // ----------------------------------------------------------------

  protected openExpenseDialog(): void {
    this.store.clearError();
    this.expenseModel.set(emptyExpenseModel());
    this.expenseForm().reset();
    this.expenseDialogVisible.set(true);
  }

  protected submitExpense(): void {
    void submit(this.expenseForm, async () => {
      const model = this.expenseModel();
      const ok = await this.store.requestExpense({
        category: model.category,
        amount: model.amount,
        description: model.description.trim(),
      });

      if (ok) {
        this.expenseDialogVisible.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Gasto solicitado',
          detail: 'Quedó pendiente de aprobación del administrador.',
        });
      } else if (this.store.error()) {
        this.messageService.add({
          severity: 'error',
          summary: 'No se pudo registrar',
          detail: this.store.error() ?? '',
        });
      }
    });
  }

  protected changeExpenseStatus(status: CashExpense['status'] | 'all'): void {
    this.expenseStatusFilter.set(status);
    this.expensePageFirst.set(0);
  }

  protected changeExpensePage(event: { first?: number; rows?: number }): void {
    this.expensePageFirst.set(event.first ?? 0);
    this.expensePageRows.set(event.rows ?? 5);
  }

  // ----------------------------------------------------------------
  // Submit closure
  // ----------------------------------------------------------------

  protected openSubmitDialog(): void {
    this.store.clearError();
    this.submitModel.set({ deliveredAmount: this.store.expectedCash(), observation: '' });
    this.submitForm().reset();
    this.submitDialogVisible.set(true);
  }

  protected submitClosure(): void {
    void submit(this.submitForm, async () => {
      const model = this.submitModel();
      const ok = await this.store.submitClosure(model.deliveredAmount, model.observation.trim());

      if (ok) {
        this.submitDialogVisible.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Cierre enviado',
          detail: 'Quedará pendiente de validación.',
        });
      } else if (this.store.error()) {
        this.messageService.add({
          severity: 'error',
          summary: 'No se pudo enviar',
          detail: this.store.error() ?? '',
        });
      }
    });
  }

  // ----------------------------------------------------------------
  // Labels
  // ----------------------------------------------------------------

  protected categoryLabel(category: CashExpenseCategory): string {
    return CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? category;
  }

  protected expenseStatusLabel(status: CashExpense['status']): string {
    return { pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado' }[status];
  }

  protected allowanceStatusLabel(status: CashAllowanceRequest['status']): string {
    return { pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado' }[status];
  }

  protected allowanceStatusSeverity(
    status: CashAllowanceRequest['status'],
  ): 'warn' | 'success' | 'danger' {
    return { pending: 'warn' as const, approved: 'success' as const, rejected: 'danger' as const }[
      status
    ];
  }

  protected expenseStatusSeverity(status: CashExpense['status']): 'warn' | 'success' | 'danger' {
    return { pending: 'warn' as const, approved: 'success' as const, rejected: 'danger' as const }[
      status
    ];
  }

  protected closureStatusLabel(status: 'draft' | 'submitted' | 'validated'): string {
    return {
      draft: 'Sin enviar',
      submitted: 'Enviado, pendiente de validación',
      validated: 'Validado',
    }[status];
  }

  protected closureStatusSeverity(
    status: 'draft' | 'submitted' | 'validated',
  ): 'secondary' | 'warn' | 'success' {
    return {
      draft: 'secondary' as const,
      submitted: 'warn' as const,
      validated: 'success' as const,
    }[status];
  }
}
