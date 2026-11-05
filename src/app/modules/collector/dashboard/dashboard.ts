import { Component, computed, effect, inject, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { ProgressBarModule } from 'primeng/progressbar';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { CollectionClientCard } from '../../../shared/ui/collection-client-card/collection-client-card';
import { CollectionMetric } from '../../../shared/ui/collection-metric/collection-metric';
import { currentLimaDate } from '../../../core/calculations/date-time';
import { EsDate } from '../../../shared/pipes/es-date';
import { PenCurrency } from '../../../shared/pipes/pen-currency';
import { AuthService } from '../../auth/auth.service';
import { CollectionDashboardStore } from '../collection-dashboard.store';
import {
  CorrectionRequest,
  CorrectionRequestStatus,
  CorrectionRequestType,
} from '../../../core/models/correction-request.model';
import {
  CollectionClient,
  CollectionFilter,
  CollectionSort,
} from '../collection.model';
import { CorrectionRequestsStore } from '../../correction-requests/correction-requests.store';

interface FilterOption {
  readonly label: string;
  readonly value: CollectionFilter;
}

@Component({
  selector: 'app-collector-dashboard',
  imports: [
    CollectionClientCard,
    CollectionMetric,
    EsDate,
    FormsModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    MessageModule,
    PenCurrency,
    ProgressBarModule,
    SelectModule,
    SkeletonModule,
  ],
  templateUrl: './dashboard.html',
})
export default class CollectorDashboard {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  readonly store = inject(CollectionDashboardStore);
  readonly correctionRequestsStore = inject(CorrectionRequestsStore);
  readonly today = currentLimaDate();
  protected readonly loadingRows = [1, 2, 3];
  protected readonly collectorFirstName = computed(
    () => this.authService.currentUser()?.fullName?.split(' ')[0] ?? '',
  );
  protected readonly recentRequests = computed(() =>
    this.correctionRequestsStore.myRequests().slice(0, 3),
  );

  readonly sortOptions: { label: string; value: CollectionSort }[] = [
    { label: 'Mayor atraso', value: 'MOST_OVERDUE' },
    { label: 'Menor atraso', value: 'LEAST_OVERDUE' },
    { label: 'Mayor saldo', value: 'HIGHEST_BALANCE' },
    { label: 'Menor saldo', value: 'LOWEST_BALANCE' },
    { label: 'Nombre (A–Z)', value: 'NAME' },
  ];

  readonly filters: readonly FilterOption[] = [
    { label: 'Todos', value: 'ALL' },
    { label: 'Cobrar hoy', value: 'DUE_TODAY' },
    { label: 'Pagaron hoy', value: 'PAID_TODAY' },
    { label: 'No pagaron hoy', value: 'NOT_PAID_TODAY' },
    { label: 'Con atraso', value: 'OVERDUE' },
    { label: 'Morosos', value: 'DEFAULTED' },
    { label: 'Préstamos activos', value: 'ACTIVE_LOANS' },
    { label: 'Préstamos pagados', value: 'PAID_LOANS' },
  ];

  constructor() {
    void this.store.load();
    if (this.correctionRequestsStore.myRequests().length === 0) {
      void this.correctionRequestsStore.loadMine();
    }

    effect(() => {
      const change = this.correctionRequestsStore.lastChange();
      if (change?.eventType !== 'UPDATE' || change.status !== 'resolved') return;
      if (change.requestType !== 'void_payment') return;

      untracked(() => void this.store.load());
    });
  }

  updateQuery(event: Event) {
    this.store.setQuery((event.target as HTMLInputElement).value);
  }

  selectFilter(filter: CollectionFilter) {
    this.store.setFilter(filter);
  }

  requestPayment(client: CollectionClient) {
    this.router.navigate(['/cobrador/cliente', client.id]);
  }

  openRequest(request: CorrectionRequest): void {
    void this.router.navigate(['/cobrador/cliente', request.customerId]);
  }

  markNotificationsRead(): void {
    void this.correctionRequestsStore.markMineRead();
  }

  requestTypeLabel(type: CorrectionRequestType): string {
    return {
      edit_loan: 'Edición de préstamo',
      void_loan: 'Anulación de préstamo',
      void_payment: 'Anulación de pago',
    }[type];
  }

  requestStatusLabel(status: CorrectionRequestStatus): string {
    return { pending: 'Pendiente', resolved: 'Aprobada', rejected: 'Rechazada' }[status];
  }
}

