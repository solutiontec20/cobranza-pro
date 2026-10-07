import { computed, inject, Injectable, signal } from '@angular/core';
import { AppStoreService } from '../../core/services/app-store.service';
import { AuthService } from '../auth/auth.service';
import {
  CollectionClient,
  CollectionFilter,
  CollectionRisk,
  CollectionSort,
} from './collection.model';

@Injectable({ providedIn: 'root' })
export class CollectionDashboardStore {
  private appStore = inject(AppStoreService);
  private authService = inject(AuthService);

  readonly query = signal('');
  readonly activeFilter = signal<CollectionFilter>('ALL');
  readonly sortOrder = signal<CollectionSort>('MOST_OVERDUE');

  readonly clients = computed<CollectionClient[]>(() => {
    const user = this.authService.currentUser();
    if (!user || user.role !== 'COBRADOR') return [];

    const allClients = this.appStore.clients().filter(c => c.collectorId === user.id && c.active);
    
    return allClients.map(client => {
      const riskStatus = this.appStore.getClientRiskStatus(client);
      const todayInstallment = this.appStore.getClientTodayInstallment(client.id);
      const paidToday = this.appStore.hasClientPaidToday(client.id);
      
      const activeLoan = this.appStore.loans().find(l => l.clientId === client.id && l.status === 'ACTIVE');
      const paidLoan = this.appStore.loans().find(l => l.clientId === client.id && l.status === 'PAID');
      const loan = activeLoan || paidLoan;

      let risk: CollectionRisk = 'current';
      if (riskStatus.level === 'yellow' || riskStatus.level === 'warning') risk = 'warning';
      else if (riskStatus.level === 'orange' || riskStatus.level === 'late') risk = 'late';
      else if (riskStatus.level === 'red' || riskStatus.level === 'defaulted') risk = 'defaulted';
      else if (riskStatus.level === 'green' || riskStatus.level === 'paid') risk = 'paid';

      return {
        id: client.id,
        fullName: client.fullName,
        dni: client.dni,
        phone: client.phone,
        address: client.address,
        installmentAmount: loan?.installmentAmount || 0,
        balance: loan?.balance || 0,
        overdueDays: riskStatus.days,
        risk,
        hasDueToday: !!todayInstallment,
        paidToday,
        collectedToday: paidToday && todayInstallment ? todayInstallment.paidAmount : 0,
        loanStatus: activeLoan ? 'ACTIVE' : 'PAID',
      };
    });
  });

  readonly summary = computed(() => {
    const clientsList = this.clients();
    const activeClients = clientsList.filter(client => client.loanStatus === 'ACTIVE');
    const expectedToday = activeClients
      .filter((client) => client.hasDueToday)
      .reduce((total, client) => total + client.installmentAmount, 0);
    const collectedToday = activeClients.reduce(
      (total, client) => total + client.collectedToday,
      0,
    );

    return {
      dueToday: activeClients.filter((client) => client.hasDueToday).length,
      expectedToday,
      collectedToday,
      overdueClients: activeClients.filter((client) => client.overdueDays > 0).length,
      completionPercentage:
        expectedToday === 0
          ? 0
          : Math.min(100, Math.round((collectedToday / expectedToday) * 100)),
    };
  });

  readonly filteredClients = computed(() => {
    const query = this.normalize(this.query());
    const filter = this.activeFilter();
    const order = this.sortOrder();

    return [...this.clients()]
      .filter((client) => this.matchesQuery(client, query))
      .filter((client) => this.matchesFilter(client, filter))
      .sort((left, right) => this.compare(left, right, order));
  });

  setQuery(query: string) {
    this.query.set(query);
  }

  setFilter(filter: CollectionFilter) {
    this.activeFilter.set(filter);
  }

  setSortOrder(sortOrder: CollectionSort) {
    this.sortOrder.set(sortOrder);
  }

  clearFilters() {
    this.query.set('');
    this.activeFilter.set('ALL');
  }

  countFor(filter: CollectionFilter) {
    return this.clients().filter((client) => this.matchesFilter(client, filter)).length;
  }

  private matchesQuery(client: CollectionClient, query: string) {
    if (!query) return true;
    return [client.fullName, client.dni, client.phone]
      .map((value) => this.normalize(value))
      .some((value) => value.includes(query));
  }

  private matchesFilter(client: CollectionClient, filter: CollectionFilter) {
    switch (filter) {
      case 'DUE_TODAY':
      case 'NOT_PAID_TODAY':
        return client.hasDueToday && !client.paidToday;
      case 'PAID_TODAY':
        return client.paidToday;
      case 'OVERDUE':
        return client.overdueDays > 0;
      case 'DEFAULTED':
        return client.risk === 'defaulted';
      case 'ACTIVE_LOANS':
        return client.loanStatus === 'ACTIVE';
      case 'PAID_LOANS':
        return client.loanStatus === 'PAID';
      case 'ALL':
        return true;
    }
  }

  private compare(left: CollectionClient, right: CollectionClient, order: CollectionSort) {
    switch (order) {
      case 'MOST_OVERDUE':
        return (right.overdueDays - left.overdueDays || Number(right.hasDueToday) - Number(left.hasDueToday));
      case 'LEAST_OVERDUE':
        return left.overdueDays - right.overdueDays;
      case 'HIGHEST_BALANCE':
        return right.balance - left.balance;
      case 'LOWEST_BALANCE':
        return left.balance - right.balance;
      case 'NAME':
        return left.fullName.localeCompare(right.fullName, 'es-PE');
    }
  }

  private normalize(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es-PE')
      .trim();
  }
}
