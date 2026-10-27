import { Component, computed, inject } from '@angular/core';
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
  CollectionClient,
  CollectionFilter,
  CollectionSort,
} from '../collection.model';

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
  readonly today = currentLimaDate();
  protected readonly loadingRows = [1, 2, 3];
  protected readonly collectorFirstName = computed(
    () => this.authService.currentUser()?.fullName?.split(' ')[0] ?? '',
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
}

