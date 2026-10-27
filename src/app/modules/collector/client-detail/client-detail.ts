import { Component, computed, inject, signal } from '@angular/core';
import { form, FormField, max, maxLength, min, required, submit, validate } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import {
  calculateLoanSummary,
  firstDueOn,
  toDateInput,
} from '../../../core/calculations/loan-calculations';
import { CreateCollectorLoanResult } from '../../../core/models/collector-portfolio.model';
import {
  LoanFrequency,
  LoanInstallmentStatus,
  LoanPaymentMethod,
  LoanPaymentRecord,
  RegisterLoanPaymentResult,
  RenewLoanResult,
} from '../../../core/models/loan.model';
import { CollectionDashboardStore } from '../collection-dashboard.store';
import { CollectionRisk } from '../collection.model';
import { CollectorLoanStore } from './collector-loan.store';
import { EsDate } from '../../../shared/pipes/es-date';
import { PenCurrency } from '../../../shared/pipes/pen-currency';

interface PaymentFormModel {
  amount: number;
  paymentMethod: LoanPaymentMethod;
  notes: string;
}

const emptyPaymentModel = (amount = 0): PaymentFormModel => ({
  amount,
  paymentMethod: 'cash',
  notes: '',
});

interface RenewFormModel {
  principal: number;
  interestRate: number;
  frequency: LoanFrequency;
  installmentCount: number;
  startedOn: string;
}

const emptyRenewModel = (principal = 100): RenewFormModel => ({
  principal,
  interestRate: 20,
  frequency: 'daily',
  installmentCount: 24,
  startedOn: toDateInput(new Date()),
});

interface CreateLoanFormModel {
  principal: number;
  interestRate: number;
  frequency: LoanFrequency;
  installmentCount: number;
  startedOn: string;
}

const emptyCreateLoanModel = (): CreateLoanFormModel => ({
  principal: 100,
  interestRate: 20,
  frequency: 'daily',
  installmentCount: 24,
  startedOn: toDateInput(new Date()),
});

type TagSeverity = 'success' | 'warn' | 'danger' | 'secondary' | 'info';

@Component({
  selector: 'app-client-detail',
  imports: [
    ButtonModule,
    EsDate,
    DialogModule,
    FormField,
    InputNumberModule,
    MessageModule,
    PenCurrency,
    SelectModule,
    SkeletonModule,
    TableModule,
    TagModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './client-detail.html',
})
export default class ClientDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);
  protected readonly store = inject(CollectionDashboardStore);
  protected readonly loanStore = inject(CollectorLoanStore);

  protected readonly loadingRows = [1, 2, 3];
  protected readonly paymentMethodOptions: Array<{ label: string; value: LoanPaymentMethod }> = [
    { label: 'Efectivo', value: 'cash' },
    { label: 'Yape', value: 'yape' },
    { label: 'Plin', value: 'plin' },
    { label: 'Transferencia', value: 'transfer' },
  ];

  private readonly customerId = signal(this.route.snapshot.paramMap.get('id') ?? '');
  private readonly resolvingLoan = signal(false);

  readonly client = computed(() =>
    this.store.clients().find((c) => c.id === this.customerId()),
  );
  readonly entry = computed(() => this.store.entryFor(this.customerId()));
  readonly detail = this.loanStore.detail;
  readonly loan = computed(() => this.detail()?.loan ?? null);

  readonly loading = computed(() => this.store.loading() || this.resolvingLoan() || this.loanStore.loadingDetail());
  readonly notFound = computed(() => !this.loading() && !this.store.loading() && !this.client());

  readonly installments = computed(() => this.detail()?.installments ?? []);
  readonly payments = computed(() => this.detail()?.payments ?? []);

  // Payment dialog state
  readonly paymentDialogVisible = signal(false);
  readonly paymentResult = signal<RegisterLoanPaymentResult | null>(null);
  readonly paymentModel = signal<PaymentFormModel>(emptyPaymentModel());
  readonly paymentForm = form(this.paymentModel, (path) => {
    min(path.amount, 0.01, { message: 'El monto debe ser mayor que cero.' });
    required(path.paymentMethod, { message: 'Selecciona el medio de pago.' });
    maxLength(path.notes, 500, { message: 'La observación no puede superar 500 caracteres.' });
  });
  readonly paymentAmountIsValid = computed(() => {
    const balance = this.loan()?.balance ?? 0;
    const amount = this.paymentModel().amount;
    return Number.isFinite(amount) && amount > 0 && amount <= balance;
  });
  readonly paymentBalancePreview = computed(() => {
    const balance = this.loan()?.balance ?? 0;
    const amount = this.paymentModel().amount;
    return Math.max(0, Math.round((balance - (Number.isFinite(amount) ? amount : 0)) * 100) / 100);
  });
  readonly quickPaymentAmounts = computed(() => {
    const loan = this.loan();
    const balance = loan?.balance ?? 0;
    if (!loan || balance <= 0) return [];

    const nextInstallment =
      this.installments().find((installment) => installment.outstandingAmount > 0)?.outstandingAmount ??
      loan.installmentAmount;

    return [...new Set([5, 10, 15, nextInstallment, balance])]
      .filter((amount) => amount > 0 && amount <= balance)
      .map((amount) => Math.round(amount * 100) / 100);
  });

  // "Report a problem" dialog state (no edit/void — the collector can only notify the admin).
  readonly reportDialogPayment = signal<LoanPaymentRecord | null>(null);
  readonly reportNote = signal('');

  // Renewal dialog state.
  // Business rule: blacklisted clients (>5 accumulated overdue days) cannot renew; clients who
  // are up to date or who already fully paid off their loan can. Renewing closes the previous
  // loan and opens a new one — reuse that path instead of creating a brand-new client, since a
  // customer's loan history should stay linked.
  readonly renewDialogVisible = signal(false);
  readonly renewResult = signal<RenewLoanResult | null>(null);
  readonly renewModel = signal<RenewFormModel>(emptyRenewModel());
  readonly renewForm = form(this.renewModel, (path) => {
    min(path.principal, 0.01, { message: 'El capital debe ser mayor que cero.' });
    min(path.interestRate, 0, { message: 'La tasa no puede ser negativa.' });
    min(path.installmentCount, 1, { message: 'Debe existir al menos una cuota.' });
    max(path.installmentCount, 32767, { message: 'La cantidad de cuotas es demasiado alta.' });
    required(path.startedOn, { message: 'Seleccioná la fecha de inicio.' });
    validate(path.principal, ({ valueOf }) => {
      const minPrincipal = this.loan()?.balance ?? 0;
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
  protected readonly renewFrequencyOptions: Array<{ label: string; value: LoanFrequency }> = [
    { label: 'Diario', value: 'daily' },
    { label: 'Semanal', value: 'weekly' },
    { label: 'Mensual', value: 'monthly' },
  ];
  readonly renewSummary = computed(() => {
    const model = this.renewModel();
    return calculateLoanSummary(model.principal, model.interestRate, model.installmentCount);
  });
  readonly renewFirstDueDate = computed(() => {
    const model = this.renewModel();
    return firstDueOn(model.startedOn, model.frequency);
  });
  readonly renewDisbursedPreview = computed(() => {
    const balance = this.loan()?.balance ?? 0;
    return Math.max(0, Math.round((this.renewModel().principal - balance) * 100) / 100);
  });

  /**
   * A loan can only be renewed while it's active or fully paid off, and only when the client
   * isn't blacklisted (more than 5 accumulated overdue days) — mirrors `renew_loan`'s server-side
   * rule so the UI doesn't offer an action the backend will reject anyway.
   */
  readonly canRenew = computed(() => {
    const loan = this.loan();
    const risk = this.client()?.risk;
    return !!loan && (loan.status === 'active' || loan.status === 'paid') && risk !== 'defaulted';
  });

  // "Create loan" dialog state — for a customer who already exists in the collector's portfolio
  // but has no loan to renew (never had one, e.g. registered by an admin without one, or their
  // only loan isn't active/paid). Prefer renewal when `canRenew()` is true so the loan history
  // stays linked; blacklisted customers get neither action, same as the server-side rule.
  readonly createLoanDialogVisible = signal(false);
  readonly createLoanResult = signal<CreateCollectorLoanResult | null>(null);
  readonly createLoanModel = signal<CreateLoanFormModel>(emptyCreateLoanModel());
  readonly createLoanForm = form(this.createLoanModel, (path) => {
    min(path.principal, 0.01, { message: 'El capital debe ser mayor que cero.' });
    min(path.interestRate, 0, { message: 'La tasa no puede ser negativa.' });
    min(path.installmentCount, 1, { message: 'Debe existir al menos una cuota.' });
    max(path.installmentCount, 32767, { message: 'La cantidad de cuotas es demasiado alta.' });
    required(path.startedOn, { message: 'Seleccioná la fecha de inicio.' });
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
  readonly createLoanSummary = computed(() => {
    const model = this.createLoanModel();
    return calculateLoanSummary(model.principal, model.interestRate, model.installmentCount);
  });
  readonly createLoanFirstDueDate = computed(() => {
    const model = this.createLoanModel();
    return firstDueOn(model.startedOn, model.frequency);
  });
  readonly canCreateLoan = computed(() => {
    if (this.canRenew()) return false;
    const client = this.client();
    return !!client && client.risk !== 'defaulted';
  });

  constructor() {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    if (this.store.clients().length === 0 && !this.store.loading()) {
      await this.store.load();
    }

    this.resolvingLoan.set(true);
    const loanId = await this.store.findLoanId(this.customerId());
    this.resolvingLoan.set(false);

    if (loanId) {
      await this.loanStore.loadDetail(loanId);
    }
  }

  goBack() {
    this.router.navigate(['/cobrador/clientes']);
  }

  openPaymentModal() {
    const loan = this.loan();
    const balance = loan?.balance ?? 0;
    if (!loan || loan.status !== 'active' || balance <= 0) return;

    const suggestedAmount =
      this.installments().find((installment) => installment.outstandingAmount > 0)?.outstandingAmount ??
      loan.installmentAmount;

    this.loanStore.clearError();
    this.paymentResult.set(null);
    this.paymentModel.set(emptyPaymentModel(Math.min(suggestedAmount, balance)));
    this.paymentForm().reset();
    this.paymentDialogVisible.set(true);
  }

  closePaymentModal() {
    if (this.loanStore.paying()) return;
    this.paymentDialogVisible.set(false);
    this.paymentResult.set(null);
    this.loanStore.clearError();
  }

  onPaymentDialogVisibleChange(visible: boolean): void {
    if (visible) {
      this.paymentDialogVisible.set(true);
      return;
    }
    this.closePaymentModal();
  }

  selectQuickAmount(amount: number) {
    this.paymentModel.update((model) => ({ ...model, amount }));
  }

  submitPayment() {
    const loan = this.loan();
    if (!loan || !this.paymentAmountIsValid()) return;

    void submit(this.paymentForm, async () => {
      const model = this.paymentModel();
      const result = await this.loanStore.registerPayment({
        loanId: loan.id,
        amount: model.amount,
        paymentMethod: model.paymentMethod,
        notes: model.notes.trim(),
      });

      if (result) {
        this.paymentResult.set(result);
        this.messageService.add({
          severity: 'success',
          summary: 'Pago registrado',
          detail: `S/ ${result.allocatedAmount.toFixed(2)} registrado para ${this.client()?.fullName}`,
          life: 4000,
        });
      } else if (this.loanStore.error()) {
        this.messageService.add({
          severity: 'error',
          summary: 'Error al registrar',
          detail: this.loanStore.error() ?? '',
          life: 5000,
        });
      }
    });
  }

  // ----------------------------------------------------------------
  // Renewal (only offered when `canRenew()` is true — see above).
  // ----------------------------------------------------------------

  openRenewDialog() {
    const loan = this.loan();
    if (!loan || !this.canRenew()) return;

    this.loanStore.clearError();
    this.renewResult.set(null);
    this.renewModel.set(
      emptyRenewModel(loan.status === 'paid' ? loan.principal : Math.max(loan.balance, loan.principal)),
    );
    this.renewForm().reset();
    this.renewDialogVisible.set(true);
  }

  closeRenewDialog() {
    if (this.loanStore.renewing()) return;
    this.renewDialogVisible.set(false);
    this.renewResult.set(null);
    this.loanStore.clearError();
  }

  onRenewDialogVisibleChange(visible: boolean): void {
    if (visible) {
      this.renewDialogVisible.set(true);
      return;
    }
    this.closeRenewDialog();
  }

  submitRenewal() {
    const loan = this.loan();
    if (!loan) return;

    void submit(this.renewForm, async () => {
      const model = this.renewModel();
      const result = await this.loanStore.renew({
        loanId: loan.id,
        principal: model.principal,
        interestRate: model.interestRate,
        frequency: model.frequency,
        installmentCount: model.installmentCount,
        startedOn: model.startedOn,
      });

      if (result) {
        this.renewResult.set(result);
        await this.store.load();
        this.messageService.add({
          severity: 'success',
          summary: 'Préstamo renovado',
          detail: `Se renovó el préstamo de ${this.client()?.fullName}.`,
          life: 4000,
        });
      } else if (this.loanStore.error()) {
        this.messageService.add({
          severity: 'error',
          summary: 'Error al renovar',
          detail: this.loanStore.error() ?? '',
          life: 5000,
        });
      }
    });
  }

  // ----------------------------------------------------------------
  // Create loan for an existing customer with no eligible loan to renew
  // (only offered when `canCreateLoan()` is true — see above).
  // ----------------------------------------------------------------

  openCreateLoanDialog() {
    if (!this.canCreateLoan()) return;

    this.store.clearError();
    this.createLoanResult.set(null);
    this.createLoanModel.set(emptyCreateLoanModel());
    this.createLoanForm().reset();
    this.createLoanDialogVisible.set(true);
  }

  closeCreateLoanDialog() {
    if (this.store.saving()) return;
    this.createLoanDialogVisible.set(false);
    this.createLoanResult.set(null);
    this.store.clearError();
  }

  onCreateLoanDialogVisibleChange(visible: boolean): void {
    if (visible) {
      this.createLoanDialogVisible.set(true);
      return;
    }
    this.closeCreateLoanDialog();
  }

  submitCreateLoan() {
    const customerId = this.customerId();
    if (!customerId) return;

    void submit(this.createLoanForm, async () => {
      const model = this.createLoanModel();
      const result = await this.store.createLoanForCustomer({
        customerId,
        principal: model.principal,
        interestRate: model.interestRate,
        frequency: model.frequency,
        installmentCount: model.installmentCount,
        startedOn: model.startedOn,
      });

      if (result) {
        this.createLoanResult.set(result);
        await this.loanStore.loadDetail(result.loanId);
        this.messageService.add({
          severity: 'success',
          summary: 'Préstamo creado',
          detail: `Se creó un préstamo nuevo para ${this.client()?.fullName}.`,
          life: 4000,
        });
      } else if (this.store.error()) {
        this.messageService.add({
          severity: 'error',
          summary: 'Error al crear el préstamo',
          detail: this.store.error() ?? '',
          life: 5000,
        });
      }
    });
  }

  // ----------------------------------------------------------------
  // Read-only payment history + "notify the admin" (collectors cannot
  // edit or void a payment — see AGENTS.md business rules).
  // ----------------------------------------------------------------

  openReportDialog(payment: LoanPaymentRecord) {
    this.reportNote.set('');
    this.reportDialogPayment.set(payment);
  }

  closeReportDialog() {
    this.reportDialogPayment.set(null);
  }

  async copyReportDetails(): Promise<void> {
    const payment = this.reportDialogPayment();
    const client = this.client();
    if (!payment) return;

    const lines = [
      'Reporte de pago — CobranzaPro',
      `Cliente: ${client?.fullName ?? ''} (DNI ${client?.dni ?? ''})`,
      `Pago: ${payment.id}`,
      `Fecha: ${payment.paidAt}`,
      `Monto registrado: S/ ${payment.amount.toFixed(2)}`,
      `Medio de pago: ${payment.paymentMethod}`,
      `Estado: ${this.paymentStatusLabel(payment.status)}`,
      `Observación original: ${payment.notes || '—'}`,
      `Detalle del problema: ${this.reportNote().trim() || '(sin detalle adicional)'}`,
    ];
    const text = lines.join('\n');

    try {
      await navigator.clipboard.writeText(text);
      this.messageService.add({
        severity: 'success',
        summary: 'Datos copiados',
        detail: 'Pegalos en tu mensaje al administrador (llamada o WhatsApp).',
        life: 4000,
      });
    } catch {
      this.messageService.add({
        severity: 'warn',
        summary: 'No se pudo copiar automáticamente',
        detail: text,
        life: 8000,
      });
    }
  }

  // ----------------------------------------------------------------
  // Labels / severities
  // ----------------------------------------------------------------

  getInstallmentSeverity(status: LoanInstallmentStatus): TagSeverity {
    return { pending: 'secondary', partial: 'warn', overdue: 'danger', paid: 'success' }[
      status
    ] as TagSeverity;
  }

  getInstallmentLabel(status: LoanInstallmentStatus): string {
    return { pending: 'Pendiente', partial: 'Parcial', overdue: 'Vencido', paid: 'Pagado' }[status];
  }

  paymentStatusLabel(status: LoanPaymentRecord['status']): string {
    return status === 'posted' ? 'Registrado' : 'Anulado';
  }

  paymentSeverity(status: LoanPaymentRecord['status']): TagSeverity {
    return status === 'posted' ? 'success' : 'secondary';
  }

  getRiskSeverity(): TagSeverity {
    const risk = this.client()?.risk;
    return this.riskSeverity(risk);
  }

  riskSeverity(risk: CollectionRisk | undefined): TagSeverity {
    switch (risk) {
      case 'current':
      case 'paid':
        return 'success';
      case 'warning':
      case 'late':
        return 'warn';
      case 'defaulted':
        return 'danger';
      default:
        return 'secondary';
    }
  }

  riskLabel(): string {
    const client = this.client();
    if (!client) return '';
    switch (client.risk) {
      case 'current':
        return `Al día (${client.overdueDays} d)`;
      case 'paid':
        return 'Sin préstamo activo';
      case 'warning':
      case 'late':
        return `Atraso (${client.overdueDays} d)`;
      case 'defaulted':
        return `Moroso (${client.overdueDays} d)`;
    }
  }

  loanStatusLabel(status: string): string {
    return { active: 'Activo', paid: 'Pagado', renewed: 'Renovado', voided: 'Anulado' }[status] ?? status;
  }
}
