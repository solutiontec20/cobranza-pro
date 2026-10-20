import { TestBed } from '@angular/core/testing';
import { LoanListItem } from '../../../core/models/loan.model';
import { LOAN_REPOSITORY, LoanRepository } from '../../../core/repositories/loan.repository';
import { calculateLoanSummary, firstDueOn } from './loan-calculations';
import { LoansStore } from './loans.store';

const loan: LoanListItem = {
  id: 'loan-1',
  clientId: 'customer-1',
  clientName: 'Ana Flores',
  collectorId: 'collector-1',
  collectorName: 'María Quispe',
  principal: 100,
  interestRate: 10,
  totalAmount: 110,
  installmentAmount: 36.67,
  installmentCount: 3,
  frequency: 'daily',
  balance: 110,
  status: 'active',
  startedOn: '2026-10-19',
  endDate: '2026-10-21',
  createdAt: '2026-10-19T12:00:00Z',
};

describe('LoansStore', () => {
  let store: LoansStore;
  let repository: {
    list: ReturnType<typeof vi.fn<LoanRepository['list']>>;
    listAvailableClients: ReturnType<typeof vi.fn<LoanRepository['listAvailableClients']>>;
    create: ReturnType<typeof vi.fn<LoanRepository['create']>>;
  };

  beforeEach(() => {
    repository = {
      list: vi.fn<LoanRepository['list']>().mockResolvedValue([loan]),
      listAvailableClients: vi.fn<LoanRepository['listAvailableClients']>().mockResolvedValue([]),
      create: vi.fn<LoanRepository['create']>(),
    };
    TestBed.configureTestingModule({
      providers: [LoansStore, { provide: LOAN_REPOSITORY, useValue: repository }],
    });
    store = TestBed.inject(LoansStore);
  });

  it('loads loans and eligible clients together', async () => {
    await store.load();
    expect(store.loans()).toEqual([loan]);
    expect(store.availableClients()).toEqual([]);
  });

  it('creates a loan and reloads server state', async () => {
    repository.create.mockResolvedValue({
      id: loan.id,
      clientId: loan.clientId,
      principal: loan.principal,
      interestRate: loan.interestRate,
      totalAmount: loan.totalAmount,
      disbursedAmount: loan.principal,
      installmentCount: loan.installmentCount,
      frequency: loan.frequency,
      startedOn: loan.startedOn,
      firstDueOn: loan.startedOn,
      status: loan.status,
      createdAt: loan.createdAt,
    });

    expect(
      await store.create({
        clientId: loan.clientId,
        principal: loan.principal,
        interestRate: loan.interestRate,
        frequency: loan.frequency,
        installmentCount: loan.installmentCount,
        startedOn: loan.startedOn,
        firstDueOn: loan.startedOn,
      }),
    ).toBe(true);
    expect(repository.list).toHaveBeenCalledOnce();
  });
});

describe('loan calculations', () => {
  it('keeps the rounding difference in the last installment', () => {
    expect(calculateLoanSummary(100, 10, 3)).toEqual({
      totalAmount: 110,
      baseInstallmentAmount: 36.67,
      lastInstallmentAmount: 36.66,
    });
  });

  it('moves a daily first due date from a weekend to Monday', () => {
    expect(firstDueOn('2026-10-18', 'daily')).toBe('2026-10-19');
  });
});
