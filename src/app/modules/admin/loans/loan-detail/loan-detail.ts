import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { form, FormField, max, maxLength, min, required, submit, validate } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import {
  LoanFrequency,
  LoanInstallmentStatus,
  LoanPaymentMethod,
  LoanPaymentRecord,
  LoanStatus,
  RegisterLoanPaymentResult,
  RenewLoanResult,
} from '../../../../core/models/loan.model';
import { EsDate } from '../../../../shared/pipes/es-date';
import { PenCurrency } from '../../../../shared/pipes/pen-currency';
import {
  calculateLoanPaymentSummary,
  calculateLoanSummary,
  firstDueOn,
  toDateInput,
} from '../loan-calculations';
import {
  LoanEditReasonCode,
  LOAN_EDIT_REASON_OPTIONS,
  resolveLoanEditReason,
} from '../loan-edit-reasons';
import { LoansStore } from '../loans.store';

interface LoanEditModel {
  principal: number;
  interestRate: number;
  frequency: LoanFrequency;
  installmentCount: number;
  startedOn: string;
  reasonCode: LoanEditReasonCode | '';
  customReason: string;
}

interface PaymentFormModel {
  amount: number;
  paymentMethod: LoanPaymentMethod;
  notes: string;
}

interface RenewFormModel {
  principal: number;
  interestRate: number;
  frequency: LoanFrequency;
  installmentCount: number;
  startedOn: string;
}

type TagSeverity = 'success' | 'warn' | 'danger' | 'secondary' | 'info';

const emptyEditModel = (): LoanEditModel => ({
  principal: 0,
  interestRate: 0,
  frequency: 'daily',
  installmentCount: 1,
  startedOn: '',
  reasonCode: '',
  customReason: '',
});

const emptyPaymentModel = (amount = 0): PaymentFormModel => ({
  amount,
  paymentMethod: 'cash',
  notes: '',
});

const emptyRenewModel = (principal = 100): RenewFormModel => ({
  principal,
  interestRate: 20,
  frequency: 'daily',
  installmentCount: 24,
  startedOn: toDateInput(new Date()),
});

@Component({
  selector: 'app-admin-loan-detail',
  imports: [
    ButtonModule,
    DialogModule,
    EsDate,
    FormField,
    InputNumberModule,
    MessageModule,
    PenCurrency,
    RouterLink,
    SelectModule,
    SkeletonModule,
    TableModule,
    TagModule,
  ],
  templateUrl: `./loan-detail.html`,
})
export default class LoanDetailPage {
  protected readonly store = inject(LoansStore);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);

  readonly loanId = input.required<string>();
  protected readonly editing = signal(false);
  protected readonly frequencyOptions: Array<{ label: string; value: LoanFrequency }> = [
    { label: 'Diario', value: 'daily' },
    { label: 'Semanal', value: 'weekly' },
    { label: 'Mensual', value: 'monthly' },
  ];
  protected readonly editReasonOptions = LOAN_EDIT_REASON_OPTIONS;
  protected readonly paymentMethodOptions: Array<{ label: string; value: LoanPaymentMethod }> = [
    { label: 'Efectivo', value: 'cash' },
    { label: 'Yape', value: 'yape' },
    { label: 'Plin', value: 'plin' },
    { label: 'Transferencia', value: 'transfer' },
  ];

  protected readonly detail = computed(() => {
    const detail = this.store.selectedDetail();
    return detail?.loan.id === this.loanId() ? detail : null;
  });
  protected readonly paymentDialogVisible = signal(false);
  protected readonly paymentResult = signal<RegisterLoanPaymentResult | null>(null);
  protected readonly paymentModel = signal<PaymentFormModel>(emptyPaymentModel());
  protected readonly paymentForm = form(this.paymentModel, (path) => {
    min(path.amount, 0.01, { message: 'El monto debe ser mayor que cero.' });
    required(path.paymentMethod, { message: 'Selecciona el medio de pago.' });
    maxLength(path.notes, 500, { message: 'La observación no puede superar 500 caracteres.' });
  });
  protected readonly editModel = signal<LoanEditModel>(emptyEditModel());
  protected readonly editForm = form(this.editModel, (path) => {
    min(path.principal, 0.01, { message: 'El capital debe ser mayor que cero.' });
    min(path.interestRate, 0, { message: 'La tasa no puede ser negativa.' });
    min(path.installmentCount, 1, { message: 'Debe existir al menos una cuota.' });
    max(path.installmentCount, 32767, { message: 'La cantidad de cuotas es demasiado alta.' });
    required(path.startedOn, { message: 'Selecciona la fecha de inicio.' });
    required(path.reasonCode, { message: 'Selecciona el motivo de la edición.' });
    maxLength(path.customReason, 500, { message: 'La justificación no puede superar 500 caracteres.' });
    validate(path.customReason, ({ valueOf }) =>
      valueOf(path.reasonCode) === 'other' && valueOf(path.customReason).trim().length === 0
        ? { kind: 'required', message: 'Ingresa una justificación.' }
        : undefined,
    );
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

  protected readonly renewDialogVisible = signal(false);
  protected readonly renewResult = signal<RenewLoanResult | null>(null);
  protected readonly renewModel = signal<RenewFormModel>(emptyRenewModel());
  protected readonly renewForm = form(this.renewModel, (path) => {
    min(path.principal, 0.01, { message: 'El capital debe ser mayor que cero.' });
    min(path.interestRate, 0, { message: 'La tasa no puede ser negativa.' });
    min(path.installmentCount, 1, { message: 'Debe existir al menos una cuota.' });
    max(path.installmentCount, 32767, { message: 'La cantidad de cuotas es demasiado alta.' });
    required(path.startedOn, { message: 'Selecciona la fecha de inicio.' });
    validate(path.principal, ({ valueOf }) => {
      const minPrincipal = this.remainingBalance();
      return valueOf(path.principal) >= minPrincipal
        ? undefined
        : { kind: 'belowOutstanding', message: `El capital debe ser al menos el saldo pendiente (S/ ${minPrincipal.toFixed(2)}).` };
    });
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

  protected readonly paymentSummary = computed(() => {
    const detail = this.detail();
    return calculateLoanPaymentSummary(detail?.loan.totalAmount ?? 0, detail?.payments ?? []);
  });
  protected readonly totalPaid = computed(() => this.paymentSummary().paidAmount);
  protected readonly remainingBalance = computed(() => this.paymentSummary().remainingBalance);
  protected readonly paidPercentage = computed(() => {
    const loan = this.detail()?.loan;
    if (!loan || loan.totalAmount <= 0) return 0;
    return Math.min(100, Math.max(0, (this.totalPaid() / loan.totalAmount) * 100));
  });
  protected readonly interestAmount = computed(() => {
    const loan = this.detail()?.loan;
    return loan ? loan.totalAmount - loan.principal : 0;
  });
  protected readonly canEdit = computed(() => {
    const detail = this.detail();
    return detail?.loan.status === 'active' && detail.payments.length === 0;
  });
  /**
   * Mirrors `renew_loan`'s server-side rule: a loan can only be renewed while active or fully
   * paid off, and only when the client isn't blacklisted (more than 5 accumulated overdue days).
   */
  protected readonly canRenew = computed(() => {
    const detail = this.detail();
    if (!detail || (detail.loan.status !== 'active' && detail.loan.status !== 'paid')) return false;
    const maxOverdueDays = detail.installments.reduce(
      (max, installment) => Math.max(max, installment.overdueDays),
      0,
    );
    return maxOverdueDays <= 5;
  });
  protected readonly renewSummary = computed(() => {
    const model = this.renewModel();
    return calculateLoanSummary(model.principal, model.interestRate, model.installmentCount);
  });
  protected readonly renewDisbursedPreview = computed(() =>
    Math.max(0, Math.round((this.renewModel().principal - this.remainingBalance()) * 100) / 100),
  );
  protected readonly clientInitials = computed(() =>
    (this.detail()?.client.fullName ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase(),
  );
  protected readonly editSummary = computed(() => {
    const model = this.editModel();
    return calculateLoanSummary(model.principal, model.interestRate, model.installmentCount);
  });
  protected readonly editFirstDueDate = computed(() => {
    const model = this.editModel();
    return firstDueOn(model.startedOn, model.frequency);
  });
  protected readonly quickPaymentAmounts = computed(() => {
    const detail = this.detail();
    const balance = this.remainingBalance();
    if (!detail || balance <= 0) return [];

    const nextInstallment =
      detail.installments.find((installment) => installment.outstandingAmount > 0)?.outstandingAmount ??
      detail.loan.installmentAmount;

    return [...new Set([5, 10, 15, nextInstallment, balance])]
      .filter((amount) => amount > 0 && amount <= balance)
      .map((amount) => Math.round(amount * 100) / 100);
  });
  protected readonly paymentAmountIsValid = computed(() => {
    const balance = this.remainingBalance();
    const amount = this.paymentModel().amount;
    return Number.isFinite(amount) && amount > 0 && amount <= balance;
  });
  protected readonly paymentBalancePreview = computed(() => {
    const balance = this.remainingBalance();
    const amount = this.paymentModel().amount;
    return Math.max(0, Math.round((balance - (Number.isFinite(amount) ? amount : 0)) * 100) / 100);
  });
  protected readonly selectedLoanReference = computed(() =>
    (this.detail()?.loan.id ?? '').slice(0, 8).toUpperCase(),
  );
  protected readonly confirmedPaymentBalance = computed(() => {
    const result = this.paymentResult();
    if (!result) return 0;

    return this.detail()?.payments.some((payment) => payment.id === result.paymentId)
      ? this.remainingBalance()
      : result.remainingBalance;
  });

  constructor() {
    effect(() => {
      const loanId = this.loanId();
      untracked(() => void this.store.loadDetail(loanId));
    });
  }

  protected startEditing(): void {
    const loan = this.detail()?.loan;
    if (!loan || !this.canEdit()) return;

    this.store.clearError();
    this.editModel.set({
      principal: loan.principal,
      interestRate: loan.interestRate,
      frequency: loan.frequency,
      installmentCount: loan.installmentCount,
      startedOn: loan.startedOn,
      reasonCode: '',
      customReason: '',
    });
    this.editForm().reset();
    this.editing.set(true);
  }

  protected cancelEditing(): void {
    this.editing.set(false);
    this.store.clearError();
  }

  protected openPaymentDialog(): void {
    const detail = this.detail();
    const balance = this.remainingBalance();
    if (!detail || detail.loan.status !== 'active' || balance <= 0) return;

    const suggestedAmount =
      detail.installments.find((installment) => installment.outstandingAmount > 0)?.outstandingAmount ??
      detail.loan.installmentAmount;

    this.editing.set(false);
    this.store.clearError();
    this.paymentResult.set(null);
    this.paymentModel.set(emptyPaymentModel(Math.min(suggestedAmount, balance)));
    this.paymentForm().reset();
    this.paymentDialogVisible.set(true);
  }

  protected closePaymentDialog(): void {
    if (this.store.paying()) return;
    this.paymentDialogVisible.set(false);
    this.paymentResult.set(null);
    this.store.clearError();
  }

  protected onPaymentDialogVisibleChange(visible: boolean): void {
    if (visible) {
      this.paymentDialogVisible.set(true);
      return;
    }
    this.closePaymentDialog();
  }

  protected selectPaymentAmount(amount: number): void {
    this.paymentModel.update((model) => ({ ...model, amount }));
  }

  protected submitPayment(): void {
    if (!this.paymentAmountIsValid()) return;

    void submit(this.paymentForm, async () => {
      const model = this.paymentModel();
      const result = await this.store.registerPayment({
        loanId: this.loanId(),
        amount: model.amount,
        paymentMethod: model.paymentMethod,
        notes: model.notes.trim(),
      });

      if (result) {
        this.paymentResult.set(result);
        this.messageService.add({
          severity: 'success',
          summary: 'Pago registrado',
          detail: 'El saldo y el cronograma fueron actualizados.',
        });
      }
    });
  }

  protected saveChanges(): void {
    void submit(this.editForm, async () => {
      const model = this.editModel();
      const reason = resolveLoanEditReason(model.reasonCode, model.customReason);
      if (!reason) return;

      const updated = await this.store.update({
        loanId: this.loanId(),
        principal: model.principal,
        interestRate: model.interestRate,
        frequency: model.frequency,
        installmentCount: model.installmentCount,
        startedOn: model.startedOn,
        reason,
      });

      if (updated) {
        this.editing.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Préstamo actualizado',
          detail: 'Las condiciones y el cronograma fueron recalculados correctamente.',
        });
      }
    });
  }

  protected openRenewDialog(): void {
    const detail = this.detail();
    if (!detail || !this.canRenew()) return;

    this.editing.set(false);
    this.store.clearError();
    this.renewResult.set(null);
    this.renewModel.set(
      emptyRenewModel(
        detail.loan.status === 'paid'
          ? detail.loan.principal
          : Math.max(this.remainingBalance(), detail.loan.principal),
      ),
    );
    this.renewForm().reset();
    this.renewDialogVisible.set(true);
  }

  protected closeRenewDialog(): void {
    if (this.store.renewing()) return;

    const result = this.renewResult();
    this.renewDialogVisible.set(false);
    this.renewResult.set(null);
    this.store.clearError();

    if (result) {
      this.router.navigate(['/admin/prestamos', result.loanId]);
    }
  }

  protected onRenewDialogVisibleChange(visible: boolean): void {
    if (visible) {
      this.renewDialogVisible.set(true);
      return;
    }
    this.closeRenewDialog();
  }

  protected submitRenewal(): void {
    void submit(this.renewForm, async () => {
      const model = this.renewModel();
      const result = await this.store.renew({
        loanId: this.loanId(),
        principal: model.principal,
        interestRate: model.interestRate,
        frequency: model.frequency,
        installmentCount: model.installmentCount,
        startedOn: model.startedOn,
      });

      if (result) {
        this.renewResult.set(result);
        this.messageService.add({
          severity: 'success',
          summary: 'Préstamo renovado',
          detail: 'El préstamo anterior se cerró y se generó un nuevo cronograma.',
        });
      }
    });
  }

  protected frequencyLabel(frequency: LoanFrequency): string {
    return this.frequencyOptions.find((option) => option.value === frequency)?.label ?? frequency;
  }

  protected loanStatusLabel(status: LoanStatus): string {
    return { active: 'Activo', paid: 'Pagado', renewed: 'Renovado', voided: 'Anulado' }[status];
  }

  protected loanStatusSeverity(status: LoanStatus): TagSeverity {
    return status === 'active' ? 'success' : status === 'voided' ? 'danger' : 'secondary';
  }

  protected installmentStatusLabel(status: LoanInstallmentStatus): string {
    return { pending: 'Pendiente', partial: 'Pago parcial', overdue: 'Vencido', paid: 'Pagado' }[status];
  }

  protected installmentSeverity(status: LoanInstallmentStatus): TagSeverity {
    return { pending: 'secondary', partial: 'warn', overdue: 'danger', paid: 'success' }[status] as TagSeverity;
  }

  protected paymentStatusLabel(status: LoanPaymentRecord['status']): string {
    return status === 'posted' ? 'Registrado' : 'Anulado';
  }

  protected paymentSeverity(status: LoanPaymentRecord['status']): TagSeverity {
    return status === 'posted' ? 'success' : 'danger';
  }

  protected paymentMethodLabel(method: string): string {
    const labels: Record<string, string> = {
      cash: 'Efectivo',
      yape: 'Yape',
      plin: 'Plin',
      transfer: 'Transferencia',
    };
    return labels[method.toLowerCase()] ?? method;
  }
}
