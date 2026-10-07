import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonDirective } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressBarModule } from 'primeng/progressbar';
import { SelectModule } from 'primeng/select';
import { CollectionClientCard } from '../../../shared/ui/collection-client-card/collection-client-card';
import { CollectionMetric } from '../../../shared/ui/collection-metric/collection-metric';
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
    ButtonDirective,
    CollectionClientCard,
    CollectionMetric,
    CurrencyPipe,
    DatePipe,
    FormsModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    ProgressBarModule,
    SelectModule,
  ],
  templateUrl: './dashboard.html',
})
export default class CollectorDashboard {
  readonly store = inject(CollectionDashboardStore);
  readonly today = new Date();
  readonly actionNotice = signal('');

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

  updateQuery(event: Event) {
    this.store.setQuery((event.target as HTMLInputElement).value);
  }

  selectFilter(filter: CollectionFilter) {
    this.store.setFilter(filter);
    this.actionNotice.set('');
  }

  requestPayment(client: CollectionClient) {
    this.actionNotice.set(
      `Seleccionaste registrar un pago para ${client.fullName}. En este corte no se modificó el saldo: la operación transaccional y auditada se integra en el siguiente flujo.`,
    );
  }
}

