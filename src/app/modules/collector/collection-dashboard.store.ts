import { computed, inject, Injectable, signal } from '@angular/core';
import { AppError } from '../../core/errors/app-error';
import {
  CollectorPortfolioEntry,
  CreateCollectorClientInput,
  CreateCollectorClientResult,
  CreateCollectorLoanInput,
  CreateCollectorLoanResult,
} from '../../core/models/collector-portfolio.model';
import { COLLECTOR_PORTFOLIO_REPOSITORY } from '../../core/repositories/collector-portfolio.repository';
import {
  CollectionClient,
  CollectionFilter,
  CollectionRisk,
  CollectionSort,
} from './collection.model';

@Injectable()
export class CollectionDashboardStore {
  private readonly repository = inject(COLLECTOR_PORTFOLIO_REPOSITORY);

  private readonly entries = signal<CollectorPortfolioEntry[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly query = signal('');
  readonly activeFilter = signal<CollectionFilter>('ALL');
  readonly sortOrder = signal<CollectionSort>('MOST_OVERDUE');

  readonly clients = computed<CollectionClient[]>(() =>
    this.entries().map((entry) => this.toCollectionClient(entry)),
  );

  readonly summary = computed(() => {
    const clientsList = this.clients();
    const activeClients = clientsList.filter((client) => client.loanStatus === 'ACTIVE');
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
        expectedToday === 0 ? 0 : Math.min(100, Math.round((collectedToday / expectedToday) * 100)),
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

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.entries.set(await this.repository.listPortfolio(currentLimaDate()));
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo cargar tu cartera de clientes.'));
    } finally {
      this.loading.set(false);
    }
  }

  async create(input: CreateCollectorClientInput): Promise<CreateCollectorClientResult | null> {
    this.saving.set(true);
    this.error.set(null);

    try {
      const result = await this.repository.createClient(input);
      await this.load();
      return result;
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo registrar el cliente.'));
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Creates a loan for a customer who already exists in the collector's portfolio but currently
   * has no renewable loan (never had one, or their only loan isn't active/paid). Prefer `renew`
   * (via `CollectorLoanStore`) when the customer has an active or fully paid loan.
   */
  async createLoanForCustomer(
    input: CreateCollectorLoanInput,
  ): Promise<CreateCollectorLoanResult | null> {
    this.saving.set(true);
    this.error.set(null);

    try {
      const result = await this.repository.createLoan(input);
      await this.load();
      return result;
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo crear el préstamo.'));
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  /** Resolves the loan to open for a given customer, even outside the cached portfolio list. */
  async findLoanId(customerId: string): Promise<string | null> {
    const cached = this.entries().find((entry) => entry.customerId === customerId);
    if (cached?.loanId) return cached.loanId;

    try {
      return await this.repository.findLatestLoanId(customerId);
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo cargar el préstamo del cliente.'));
      return null;
    }
  }

  entryFor(customerId: string): CollectorPortfolioEntry | undefined {
    return this.entries().find((entry) => entry.customerId === customerId);
  }

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

  clearError(): void {
    this.error.set(null);
  }

  countFor(filter: CollectionFilter) {
    return this.clients().filter((client) => this.matchesFilter(client, filter)).length;
  }

  private toCollectionClient(entry: CollectorPortfolioEntry): CollectionClient {
    const risk = this.riskFor(entry);

    return {
      id: entry.customerId,
      fullName: entry.fullName,
      dni: entry.dni,
      phone: entry.phone,
      address: entry.address,
      installmentAmount: entry.installmentAmount,
      balance: entry.remainingBalance,
      overdueDays: entry.overdueDays,
      risk,
      hasDueToday: entry.todayScheduledAmount > 0,
      paidToday: entry.todayCollectedAmount > 0,
      collectedToday: entry.todayCollectedAmount,
      loanStatus: entry.isLoanActive ? 'ACTIVE' : 'PAID',
    };
  }

  /**
   * A client automatically becomes "moroso" after more than 5 days of accumulated overdue
   * (confirmed business rule, mirrored by `customer_financial_status.is_blacklisted` in the
   * database: `overdue_days > 5`). There is no intermediate "late" tier backed by a real rule.
   */
  private riskFor(entry: CollectorPortfolioEntry): CollectionRisk {
    if (!entry.isLoanActive) return 'paid';
    if (entry.overdueDays > 5) return 'defaulted';
    if (entry.overdueDays > 0) return 'warning';
    return 'current';
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
        return (
          right.overdueDays - left.overdueDays || Number(right.hasDueToday) - Number(left.hasDueToday)
        );
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

  private messageFrom(error: unknown, fallback: string): string {
    return AppError.from(error).message || fallback;
  }
}

function currentLimaDate(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value['year']}-${value['month']}-${value['day']}`;
}
