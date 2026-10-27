import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { form, FormField, max, maxLength, min, required, submit, validate } from '@angular/forms/signals';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { calculateExpectedCash, calculateTotalCollected } from '../../../core/calculations/cash-closure-calculations';
import { CashExpense, CashExpenseCategory, CollectorCashDay } from '../../../core/models/cash-closure.model';
import { CashClosureStore } from './cash-closure.store';

interface OpeningFormModel {
  amount: number;
  notes: string;
}

interface ExpenseFormModel {
  category: CashExpenseCategory;
  amount: number;
  description: string;
}

interface RejectFormModel {
  reason: string;
}

interface ValidateFormModel {
  observation: string;
}

const emptyOpeningModel = (): OpeningFormModel => ({ amount: 0, notes: '' });
const emptyExpenseModel = (): ExpenseFormModel => ({ category: 'fuel', amount: 0, description: '' });
const emptyRejectModel = (): RejectFormModel => ({ reason: '' });
const emptyValidateModel = (): ValidateFormModel => ({ observation: '' });

const CATEGORY_OPTIONS: Array<{ label: string; value: CashExpenseCategory }> = [
  { label: 'Combustible', value: 'fuel' },
  { label: 'Peajes', value: 'tolls' },
  { label: 'Pasajes', value: 'fares' },
  { label: 'Estacionamiento', value: 'parking' },
  { label: 'Alimentación', value: 'meals' },
  { label: 'Otros', value: 'other' },
];

@Component({
  selector: 'app-admin-cash-closure',
  imports: [
    ButtonModule,
    CurrencyPipe,
    DatePickerModule,
    DialogModule,
    FormField,
    FormsModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    SkeletonModule,
    TagModule,
  ],
  providers: [MessageService],
  templateUrl: './cash-closure.html',
})
export default class AdminCashClosure {
  protected readonly store = inject(CashClosureStore);
  private readonly messageService = inject(MessageService);

  protected readonly loadingRows = [1, 2, 3];
  protected readonly categoryOptions = CATEGORY_OPTIONS;
  protected readonly selectedDate = signal(dateFromIso(this.store.businessDate()));

  // Opening / allowance dialogs share the same form shape.
  protected readonly openingDialogVisible = signal(false);
  protected readonly openingDialogKind = signal<'opening' | 'allowance'>('opening');
  protected readonly openingModel = signal<OpeningFormModel>(emptyOpeningModel());
  protected readonly openingForm = form(this.openingModel, (path) => {
    min(path.amount, 0.01, { message: 'El monto debe ser mayor que cero.' });
    maxLength(path.notes, 300, { message: 'La nota no puede superar 300 caracteres.' });
  });

  // Request-an-expense-on-behalf-of-a-collector dialog.
  protected readonly expenseDialogVisible = signal(false);
  protected readonly expenseModel = signal<ExpenseFormModel>(emptyExpenseModel());
  protected readonly expenseForm = form(this.expenseModel, (path) => {
    required(path.category, { message: 'Seleccioná la categoría.' });
    min(path.amount, 0.01, { message: 'El monto debe ser mayor que cero.' });
    maxLength(path.description, 300, { message: 'La descripción no puede superar 300 caracteres.' });
  });

  // Reject-expense dialog (approve happens directly from the list).
  protected readonly rejectDialogVisible = signal(false);
  protected readonly rejectingExpense = signal<CashExpense | null>(null);
  protected readonly rejectModel = signal<RejectFormModel>(emptyRejectModel());
  protected readonly rejectForm = form(this.rejectModel, (path) => {
    required(path.reason, { message: 'Ingresá el motivo del rechazo.' });
    maxLength(path.reason, 300, { message: 'El motivo no puede superar 300 caracteres.' });
  });

  // Validate-closure dialog.
  protected readonly validateDialogVisible = signal(false);
  protected readonly validateModel = signal<ValidateFormModel>(emptyValidateModel());
  protected readonly validateForm = form(this.validateModel, (path) => {
    maxLength(path.observation, 300, { message: 'La observación no puede superar 300 caracteres.' });
    validate(path.observation, ({ valueOf }) => {
      const day = this.store.selectedDay();
      const closure = day?.closure;
      if (!closure) return undefined;
      const hasDifference = closure.deliveredAmount !== calculateExpectedCash(day.breakdown);
      const hasObservation = !!closure.observation?.trim() || !!valueOf(path.observation).trim();
      return hasDifference && !hasObservation
        ? { kind: 'required', message: 'Ingresá una observación: el monto entregado no coincide con el esperado.' }
        : undefined;
    });
  });

  protected readonly totalCollected = computed(() => {
    const day = this.store.selectedDay();
    return day ? calculateTotalCollected(day.breakdown) : 0;
  });

  constructor() {
    void this.store.load();
  }

  protected async changeDate(value: Date | null): Promise<void> {
    if (!value) return;
    this.selectedDate.set(value);
    this.store.setBusinessDate(toIsoDate(value));
  }

  protected selectCollector(day: CollectorCashDay): void {
    this.store.selectCollector(day.collectorId);
  }

  protected calculateExpectedCashFor(day: CollectorCashDay): number {
    return calculateExpectedCash(day.breakdown);
  }

  protected pendingCountFor(day: CollectorCashDay): number {
    return day.expenses.filter((expense) => expense.status === 'pending').length;
  }

  // ----------------------------------------------------------------
  // Opening / allowance
  // ----------------------------------------------------------------

  protected openOpeningDialog(kind: 'opening' | 'allowance'): void {
    this.store.clearError();
    this.openingDialogKind.set(kind);
    this.openingModel.set(emptyOpeningModel());
    this.openingForm().reset();
    this.openingDialogVisible.set(true);
  }

  protected submitOpening(): void {
    const day = this.store.selectedDay();
    if (!day) return;

    void submit(this.openingForm, async () => {
      const model = this.openingModel();
      const kind = this.openingDialogKind();
      const ok =
        kind === 'opening'
          ? await this.store.registerOpening({
              collectorId: day.collectorId,
              amount: model.amount,
              notes: model.notes.trim(),
            })
          : await this.store.registerAllowance({
              collectorId: day.collectorId,
              amount: model.amount,
              notes: model.notes.trim(),
            });

      if (ok) {
        this.openingDialogVisible.set(false);
        this.messageService.add({
          severity: 'success',
          summary: kind === 'opening' ? 'Apertura registrada' : 'Viático registrado',
          detail: `Se registró para ${day.collectorName}.`,
        });
      }
    });
  }

  // ----------------------------------------------------------------
  // Expense requested on behalf of a collector
  // ----------------------------------------------------------------

  protected openExpenseDialog(): void {
    this.store.clearError();
    this.expenseModel.set(emptyExpenseModel());
    this.expenseForm().reset();
    this.expenseDialogVisible.set(true);
  }

  protected submitExpense(): void {
    const day = this.store.selectedDay();
    if (!day) return;

    void submit(this.expenseForm, async () => {
      const model = this.expenseModel();
      const ok = await this.store.requestExpense({
        collectorId: day.collectorId,
        category: model.category,
        amount: model.amount,
        description: model.description.trim(),
      });

      if (ok) {
        this.expenseDialogVisible.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Gasto registrado',
          detail: 'Quedó pendiente de aprobación.',
        });
      }
    });
  }

  // ----------------------------------------------------------------
  // Review expenses
  // ----------------------------------------------------------------

  protected async approveExpense(expense: CashExpense): Promise<void> {
    const ok = await this.store.reviewExpense({ expenseId: expense.id, approve: true, reason: '' });
    if (ok) {
      this.messageService.add({ severity: 'success', summary: 'Gasto aprobado', detail: 'Se descontó del efectivo esperado.' });
    }
  }

  protected openRejectDialog(expense: CashExpense): void {
    this.store.clearError();
    this.rejectingExpense.set(expense);
    this.rejectModel.set(emptyRejectModel());
    this.rejectForm().reset();
    this.rejectDialogVisible.set(true);
  }

  protected submitReject(): void {
    const expense = this.rejectingExpense();
    if (!expense) return;

    void submit(this.rejectForm, async () => {
      const ok = await this.store.reviewExpense({
        expenseId: expense.id,
        approve: false,
        reason: this.rejectModel().reason.trim(),
      });

      if (ok) {
        this.rejectDialogVisible.set(false);
        this.messageService.add({ severity: 'info', summary: 'Gasto rechazado', detail: 'No afecta el efectivo esperado.' });
      }
    });
  }

  // ----------------------------------------------------------------
  // Validate closure
  // ----------------------------------------------------------------

  protected openValidateDialog(): void {
    this.store.clearError();
    this.validateModel.set(emptyValidateModel());
    this.validateForm().reset();
    this.validateDialogVisible.set(true);
  }

  protected submitValidate(): void {
    const closure = this.store.selectedDay()?.closure;
    if (!closure) return;

    void submit(this.validateForm, async () => {
      const ok = await this.store.validateClosure(closure.id, this.validateModel().observation.trim());
      if (ok) {
        this.validateDialogVisible.set(false);
        this.messageService.add({ severity: 'success', summary: 'Cierre validado', detail: 'La caja del día quedó conciliada.' });
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

  protected expenseStatusSeverity(status: CashExpense['status']): 'warn' | 'success' | 'danger' {
    return { pending: 'warn' as const, approved: 'success' as const, rejected: 'danger' as const }[status];
  }

  protected closureStatusLabel(status: 'draft' | 'submitted' | 'validated'): string {
    return { draft: 'Sin enviar', submitted: 'Enviado', validated: 'Validado' }[status];
  }

  protected closureStatusSeverity(status: 'draft' | 'submitted' | 'validated'): 'secondary' | 'warn' | 'success' {
    return { draft: 'secondary' as const, submitted: 'warn' as const, validated: 'success' as const }[status];
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
