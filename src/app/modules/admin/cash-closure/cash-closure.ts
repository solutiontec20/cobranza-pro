import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import {
  form,
  FormField,
  max,
  maxLength,
  min,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import {
  calculateExpectedCash,
  calculateTotalCollected,
} from '../../../core/calculations/cash-closure-calculations';
import { parseDateValue, toIsoDateLima } from '../../../core/calculations/date-time';
import {
  CashAllowanceRequest,
  CashExpense,
  CashExpenseCategory,
  CollectorCashDay,
} from '../../../core/models/cash-closure.model';
import { EsDate } from '../../../shared/pipes/es-date';
import { PenCurrency } from '../../../shared/pipes/pen-currency';
import { CashClosureStore } from './cash-closure.store';

interface OpeningFormModel {
  amount: number;
  notes: string;
}

interface RejectFormModel {
  reason: string;
}

interface ValidateFormModel {
  observation: string;
}

const emptyOpeningModel = (): OpeningFormModel => ({ amount: 0, notes: '' });
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
    DatePickerModule,
    DialogModule,
    EsDate,
    FormField,
    FormsModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    PenCurrency,
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
  protected readonly selectedDate = linkedSignal(() => parseDateValue(this.store.businessDate()));

  // Opening dialog.
  protected readonly openingDialogVisible = signal(false);
  protected readonly openingModel = signal<OpeningFormModel>(emptyOpeningModel());
  protected readonly openingForm = form(this.openingModel, (path) => {
    min(path.amount, 0.01, { message: 'El monto debe ser mayor que cero.' });
    maxLength(path.notes, 300, { message: 'La nota no puede superar 300 caracteres.' });
  });

  // Reject-expense dialog (approve happens directly from the list).
  protected readonly rejectDialogVisible = signal(false);
  protected readonly rejectingExpense = signal<CashExpense | null>(null);
  protected readonly rejectModel = signal<RejectFormModel>(emptyRejectModel());
  protected readonly rejectForm = form(this.rejectModel, (path) => {
    required(path.reason, { message: 'Ingresá el motivo del rechazo.' });
    maxLength(path.reason, 300, { message: 'El motivo no puede superar 300 caracteres.' });
  });

  // Reject-allowance dialog (approve happens directly from the list).
  protected readonly allowanceRejectDialogVisible = signal(false);
  protected readonly rejectingAllowanceRequest = signal<CashAllowanceRequest | null>(null);
  protected readonly allowanceRejectModel = signal<RejectFormModel>(emptyRejectModel());
  protected readonly allowanceRejectForm = form(this.allowanceRejectModel, (path) => {
    required(path.reason, { message: 'Ingresá el motivo del rechazo.' });
    maxLength(path.reason, 300, { message: 'El motivo no puede superar 300 caracteres.' });
  });

  // Validate-closure dialog.
  protected readonly validateDialogVisible = signal(false);
  protected readonly validateModel = signal<ValidateFormModel>(emptyValidateModel());
  protected readonly validateForm = form(this.validateModel, (path) => {
    maxLength(path.observation, 300, {
      message: 'La observación no puede superar 300 caracteres.',
    });
    validate(path.observation, ({ valueOf }) => {
      const day = this.store.selectedDay();
      const closure = day?.closure;
      if (!closure) return undefined;
      const hasDifference = closure.deliveredAmount !== calculateExpectedCash(day.breakdown);
      const hasObservation = !!closure.observation?.trim() || !!valueOf(path.observation).trim();
      return hasDifference && !hasObservation
        ? {
            kind: 'required',
            message: 'Ingresá una observación: el monto entregado no coincide con el esperado.',
          }
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
    this.store.setBusinessDate(toIsoDateLima(value));
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

  protected pendingAllowanceCountFor(day: CollectorCashDay): number {
    return day.allowanceRequests.filter((request) => request.status === 'pending').length;
  }

  // ----------------------------------------------------------------
  // Opening
  // ----------------------------------------------------------------

  protected openOpeningDialog(): void {
    this.store.clearError();
    this.openingModel.set(emptyOpeningModel());
    this.openingForm().reset();
    this.openingDialogVisible.set(true);
  }

  protected submitOpening(): void {
    const day = this.store.selectedDay();
    if (!day) return;

    void submit(this.openingForm, async () => {
      const model = this.openingModel();
      const ok = await this.store.registerOpening({
        collectorId: day.collectorId,
        amount: model.amount,
        notes: model.notes.trim(),
      });

      if (ok) {
        this.openingDialogVisible.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Apertura registrada',
          detail: `Se registró para ${day.collectorName}.`,
        });
      }
    });
  }

  // ----------------------------------------------------------------
  // Review allowance requests
  // ----------------------------------------------------------------

  protected async approveAllowanceRequest(request: CashAllowanceRequest): Promise<void> {
    const ok = await this.store.reviewAllowanceRequest({
      requestId: request.id,
      approve: true,
      reason: '',
    });
    if (ok) {
      this.messageService.add({
        severity: 'success',
        summary: 'Viático aprobado',
        detail: 'El monto se sumó al efectivo esperado del cobrador.',
      });
    }
  }

  protected openAllowanceRejectDialog(request: CashAllowanceRequest): void {
    this.store.clearError();
    this.rejectingAllowanceRequest.set(request);
    this.allowanceRejectModel.set(emptyRejectModel());
    this.allowanceRejectForm().reset();
    this.allowanceRejectDialogVisible.set(true);
  }

  protected submitAllowanceReject(): void {
    const request = this.rejectingAllowanceRequest();
    if (!request) return;

    void submit(this.allowanceRejectForm, async () => {
      const ok = await this.store.reviewAllowanceRequest({
        requestId: request.id,
        approve: false,
        reason: this.allowanceRejectModel().reason.trim(),
      });

      if (ok) {
        this.allowanceRejectDialogVisible.set(false);
        this.messageService.add({
          severity: 'info',
          summary: 'Viático rechazado',
          detail: 'La solicitud no modificó el efectivo esperado.',
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
      this.messageService.add({
        severity: 'success',
        summary: 'Gasto aprobado',
        detail: 'Se descontó del efectivo esperado.',
      });
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
        this.messageService.add({
          severity: 'info',
          summary: 'Gasto rechazado',
          detail: 'No afecta el efectivo esperado.',
        });
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
      const ok = await this.store.validateClosure(
        closure.id,
        this.validateModel().observation.trim(),
      );
      if (ok) {
        this.validateDialogVisible.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Cierre validado',
          detail: 'La caja del día quedó conciliada.',
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

  protected expenseStatusSeverity(status: CashExpense['status']): 'warn' | 'success' | 'danger' {
    return { pending: 'warn' as const, approved: 'success' as const, rejected: 'danger' as const }[
      status
    ];
  }

  protected closureStatusLabel(status: 'draft' | 'submitted' | 'validated'): string {
    return { draft: 'Sin enviar', submitted: 'Enviado', validated: 'Validado' }[status];
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
