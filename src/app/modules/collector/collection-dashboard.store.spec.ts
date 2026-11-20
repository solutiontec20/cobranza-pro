import { TestBed } from '@angular/core/testing';
import { CollectorPortfolioEntry } from '../../core/models/collector-portfolio.model';
import {
  COLLECTOR_PORTFOLIO_REPOSITORY,
  CollectorPortfolioRepository,
} from '../../core/repositories/collector-portfolio.repository';
import { CollectionDashboardStore } from './collection-dashboard.store';

const overdueEntry: CollectorPortfolioEntry = {
  customerId: 'customer-1',
  dni: '45678901',
  fullName: 'Juan Pérez',
  phone: '991122334',
  address: 'Av. España 450',
  notes: '',
  loanId: 'loan-1',
  principal: 200,
  interestRate: 20,
  totalAmount: 240,
  installmentCount: 24,
  frequency: 'daily',
  startedOn: '2026-09-01',
  firstDueOn: '2026-09-01',
  isLoanActive: true,
  remainingBalance: 150,
  installmentAmount: 10,
  todayScheduledAmount: 10,
  todayOutstandingAmount: 10,
  todayCollectedAmount: 0,
  overdueDays: 6,
};

const currentEntry: CollectorPortfolioEntry = {
  ...overdueEntry,
  customerId: 'customer-2',
  dni: '46789012',
  fullName: 'María López',
  overdueDays: 0,
  todayCollectedAmount: 10,
  todayOutstandingAmount: 0,
};

const noLoanEntry: CollectorPortfolioEntry = {
  ...overdueEntry,
  customerId: 'customer-3',
  dni: '47890123',
  fullName: 'Roberto Gómez',
  loanId: null,
  frequency: null,
  startedOn: null,
  firstDueOn: null,
  isLoanActive: false,
  remainingBalance: 0,
  installmentAmount: 0,
  todayScheduledAmount: 0,
  todayOutstandingAmount: 0,
  todayCollectedAmount: 0,
  overdueDays: 0,
};

describe('CollectionDashboardStore', () => {
  let store: CollectionDashboardStore;
  let repository: {
    listPortfolio: ReturnType<typeof vi.fn<CollectorPortfolioRepository['listPortfolio']>>;
    createClient: ReturnType<typeof vi.fn<CollectorPortfolioRepository['createClient']>>;
    createLoan: ReturnType<typeof vi.fn<CollectorPortfolioRepository['createLoan']>>;
    findLatestLoanId: ReturnType<typeof vi.fn<CollectorPortfolioRepository['findLatestLoanId']>>;
  };

  beforeEach(() => {
    repository = {
      listPortfolio: vi
        .fn<CollectorPortfolioRepository['listPortfolio']>()
        .mockResolvedValue([overdueEntry, currentEntry, noLoanEntry]),
      createClient: vi.fn<CollectorPortfolioRepository['createClient']>(),
      createLoan: vi.fn<CollectorPortfolioRepository['createLoan']>(),
      findLatestLoanId: vi.fn<CollectorPortfolioRepository['findLatestLoanId']>(),
    };
    TestBed.configureTestingModule({
      providers: [
        CollectionDashboardStore,
        { provide: COLLECTOR_PORTFOLIO_REPOSITORY, useValue: repository },
      ],
    });
    store = TestBed.inject(CollectionDashboardStore);
  });

  it('loads the portfolio and maps it to collection clients', async () => {
    await store.load();
    expect(store.clients()).toHaveLength(3);
    expect(repository.listPortfolio).toHaveBeenCalledTimes(1);
  });

  it('marks a client with more than 5 overdue days as defaulted', async () => {
    await store.load();
    const client = store.clients().find((c) => c.id === 'customer-1');
    expect(client?.risk).toBe('defaulted');
  });

  it('marks an up-to-date client as current and a loan-less client as paid', async () => {
    await store.load();
    const current = store.clients().find((c) => c.id === 'customer-2');
    const noLoan = store.clients().find((c) => c.id === 'customer-3');
    expect(current?.risk).toBe('current');
    expect(noLoan?.risk).toBe('paid');
    expect(noLoan?.loanStatus).toBe('PAID');
  });

  it('filters defaulted clients', async () => {
    await store.load();
    store.setFilter('DEFAULTED');
    expect(store.filteredClients().map((c) => c.id)).toEqual(['customer-1']);
  });

  it('sorts by most overdue first', async () => {
    await store.load();
    store.setSortOrder('MOST_OVERDUE');
    expect(store.filteredClients()[0].id).toBe('customer-1');
  });

  it('creates a client and reloads the portfolio', async () => {
    repository.createClient.mockResolvedValue({
      customerId: 'customer-4',
      loanId: 'loan-4',
      totalAmount: 110,
      baseInstallmentAmount: 36.67,
      lastInstallmentAmount: 36.66,
      firstDueOn: '2026-10-20',
    });

    const result = await store.create({
      dni: '48901234',
      fullName: 'Nuevo Cliente',
      phone: '',
      address: 'Dirección',
      notes: '',
      principal: 100,
      interestRate: 10,
      frequency: 'daily',
      installmentCount: 3,
      startedOn: '2026-10-20',
    });

    expect(result?.customerId).toBe('customer-4');
    expect(repository.listPortfolio).toHaveBeenCalledTimes(1);
  });

  it('sets an error when creating a client fails', async () => {
    repository.createClient.mockRejectedValue(new Error('El DNI debe contener entre 8 y 12 dígitos.'));

    const result = await store.create({
      dni: 'x',
      fullName: 'Nuevo Cliente',
      phone: '',
      address: 'Dirección',
      notes: '',
      principal: 100,
      interestRate: 10,
      frequency: 'daily',
      installmentCount: 3,
      startedOn: '2026-10-20',
    });

    expect(result).toBeNull();
    expect(store.error()).toBe('El DNI debe contener entre 8 y 12 dígitos.');
  });

  it('resolves the loan id from the cached portfolio without a repository call', async () => {
    await store.load();
    await expect(store.findLoanId('customer-1')).resolves.toBe('loan-1');
    expect(repository.findLatestLoanId).not.toHaveBeenCalled();
  });

  it('falls back to the repository when the customer has no active loan cached', async () => {
    await store.load();
    repository.findLatestLoanId.mockResolvedValue('loan-9');
    await expect(store.findLoanId('customer-3')).resolves.toBe('loan-9');
    expect(repository.findLatestLoanId).toHaveBeenCalledWith('customer-3');
  });

  it('creates a loan for an existing customer and reloads the portfolio', async () => {
    repository.createLoan.mockResolvedValue({
      loanId: 'loan-10',
      customerId: 'customer-3',
      totalAmount: 110,
      disbursedAmount: 100,
      baseInstallmentAmount: 36.67,
      lastInstallmentAmount: 36.66,
      firstDueOn: '2026-10-25',
    });

    const result = await store.createLoanForCustomer({
      customerId: 'customer-3',
      principal: 100,
      interestRate: 10,
      frequency: 'daily',
      installmentCount: 3,
      startedOn: '2026-10-25',
    });

    expect(result?.loanId).toBe('loan-10');
    expect(repository.listPortfolio).toHaveBeenCalledTimes(1);
  });

  it('sets an error when creating a loan for an existing customer fails', async () => {
    repository.createLoan.mockRejectedValue(new Error('El cliente ya tiene un préstamo activo.'));

    const result = await store.createLoanForCustomer({
      customerId: 'customer-3',
      principal: 100,
      interestRate: 10,
      frequency: 'daily',
      installmentCount: 3,
      startedOn: '2026-10-25',
    });

    expect(result).toBeNull();
    expect(store.error()).toBe('El cliente ya tiene un préstamo activo.');
  });
});
