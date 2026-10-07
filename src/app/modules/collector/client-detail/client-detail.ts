import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonDirective } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { MessageService } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { AppStoreService, SYSTEM_DATE } from '../../../core/services/app-store.service';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-client-detail',
  imports: [
    ButtonDirective,
    CurrencyPipe,
    DatePipe,
    DialogModule,
    FormsModule,
    InputNumberModule,
    TextareaModule,
    TableModule,
    TagModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './client-detail.html',
})
export default class ClientDetail {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private appStore = inject(AppStoreService);
  private authService = inject(AuthService);
  private messageService = inject(MessageService);

  readonly today = SYSTEM_DATE;

  readonly clientId = signal(this.route.snapshot.paramMap.get('id') ?? '');

  readonly client = computed(() =>
    this.appStore.clients().find((c) => c.id === this.clientId()),
  );

  readonly loan = computed(() => {
    const id = this.clientId();
    return (
      this.appStore.loans().find((l) => l.clientId === id && l.status === 'ACTIVE') ??
      this.appStore.loans().find((l) => l.clientId === id)
    );
  });

  readonly risk = computed(() => {
    const client = this.client();
    if (!client) return null;
    return this.appStore.getClientRiskStatus(client);
  });

  readonly collector = computed(() => {
    const client = this.client();
    if (!client) return null;
    return this.appStore.profiles().find((p) => p.id === client.collectorId);
  });

  readonly installments = computed(() => {
    const loan = this.loan();
    if (!loan) return [];
    return this.appStore
      .loanInstallments()
      .filter((i) => i.loanId === loan.id)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);
  });

  readonly clientPayments = computed(() => {
    const loan = this.loan();
    if (!loan) return [];
    return this.appStore
      .payments()
      .filter((p) => p.loanId === loan.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });

  readonly totalPaid = computed(() => {
    const loan = this.loan();
    return loan ? loan.totalAmount - loan.balance : 0;
  });

  // Payment modal state
  readonly showPaymentModal = signal(false);
  readonly paymentAmount = signal<number | null>(null);
  readonly paymentNotes = signal('');
  readonly paymentSuccess = signal(false);
  readonly paymentResult = signal<{ amount: number; newBalance: number; isPaidOff: boolean } | null>(null);
  readonly isSubmitting = signal(false);

  readonly quickAmounts = computed(() => {
    const loan = this.loan();
    if (!loan) return [];
    const cuota = loan.installmentAmount;
    return [cuota, cuota * 2, cuota * 5, cuota * 10].filter((a) => a <= loan.balance);
  });

  goBack() {
    this.router.navigate(['/cobrador']);
  }

  openPaymentModal() {
    this.paymentAmount.set(this.loan()?.installmentAmount ?? null);
    this.paymentNotes.set('Cobranza en campo');
    this.paymentSuccess.set(false);
    this.paymentResult.set(null);
    this.showPaymentModal.set(true);
  }

  closePaymentModal() {
    this.showPaymentModal.set(false);
  }

  selectQuickAmount(amount: number) {
    this.paymentAmount.set(amount);
  }

  submitPayment() {
    const loan = this.loan();
    const amount = this.paymentAmount();
    const user = this.authService.currentUser();

    if (!loan || !amount || amount <= 0 || !user) return;

    this.isSubmitting.set(true);
    try {
      const result = this.appStore.registerPayment(loan.id, amount, this.paymentNotes(), user.id);
      this.paymentResult.set(result);
      this.paymentSuccess.set(true);
      this.messageService.add({
        severity: 'success',
        summary: 'Pago registrado',
        detail: `S/ ${amount.toFixed(2)} registrado para ${this.client()?.fullName}`,
        life: 4000,
      });
    } catch (err) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error al registrar',
        detail: err instanceof Error ? err.message : 'Error inesperado',
        life: 5000,
      });
    } finally {
      this.isSubmitting.set(false);
    }
  }

  getInstallmentSeverity(status: string, dueDate: string): 'success' | 'warn' | 'danger' | 'secondary' {
    if (status === 'PAGADO') return 'success';
    if (status === 'PAGO_PARCIAL') return 'warn';
    if (dueDate < this.today) return 'danger';
    return 'secondary';
  }

  getInstallmentLabel(status: string, dueDate: string): string {
    if (status === 'PAGADO') return 'Pagado';
    if (status === 'PAGO_PARCIAL') return 'Parcial';
    if (dueDate < this.today) return 'Vencido';
    return 'Pendiente';
  }

  getRiskSeverity(): 'success' | 'warn' | 'danger' | 'secondary' {
    const r = this.risk();
    if (!r) return 'secondary';
    switch (r.level) {
      case 'current':
      case 'paid':
        return 'success';
      case 'warning':
        return 'warn';
      case 'late':
        return 'warn';
      case 'defaulted':
        return 'danger';
      default:
        return 'secondary';
    }
  }
}
