import { TestBed } from '@angular/core/testing';
import { CashDayBreakdown, CollectorCashDay } from '../../../core/models/cash-closure.model';
import {
  CASH_CLOSURE_REPOSITORY,
  CashClosureRepository,
} from '../../../core/repositories/cash-closure.repository';
import { CashClosureStore } from './cash-closure.store';

function makeBreakdown(partial: Partial<CashDayBreakdown> = {}): CashDayBreakdown {
  return {
    collectorId: 'collector-1',
    businessDate: '2026-10-25',
    openingAmount: 0,
    allowanceAmount: 0,
    cashCollectedAmount: 0,
    yapeCollectedAmount: 0,
    plinCollectedAmount: 0,
    transferCollectedAmount: 0,
    voidedCashAmount: 0,
    loanDisbursementAmount: 0,
    operatingExpenseAmount: 0,
    ...partial,
  };
}

const dayA: CollectorCashDay = {
  collectorId: 'collector-1',
  collectorName: 'Pedro Castillo',
  businessDate: '2026-10-25',
  breakdown: makeBreakdown({ openingAmount: 1000, allowanceAmount: 100, cashCollectedAmount: 650, loanDisbursementAmount: 600, operatingExpenseAmount: 50 }),
  closure: null,
  expenses: [
    {
      id: 'expense-1',
      collectorId: 'collector-1',
      businessDate: '2026-10-25',
      category: 'fuel',
      amount: 50,
      description: null,
      status: 'pending',
      cashMovementId: null,
      requestedBy: 'collector-1',
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null,
      createdAt: '2026-10-25T18:00:00Z',
    },
  ],
};

const dayB: CollectorCashDay = {
  collectorId: 'collector-2',
  collectorName: 'Luis Ramos',
  businessDate: '2026-10-25',
  breakdown: makeBreakdown({ collectorId: 'collector-2' }),
  closure: null,
  expenses: [],
};

describe('CashClosureStore', () => {
  let store: CashClosureStore;
  let repository: {
    listActiveCollectors: ReturnType<typeof vi.fn<CashClosureRepository['listActiveCollectors']>>;
    getOwnDay: ReturnType<typeof vi.fn<CashClosureRepository['getOwnDay']>>;
    listDay: ReturnType<typeof vi.fn<CashClosureRepository['listDay']>>;
    registerOpening: ReturnType<typeof vi.fn<CashClosureRepository['registerOpening']>>;
    registerAllowance: ReturnType<typeof vi.fn<CashClosureRepository['registerAllowance']>>;
    requestExpense: ReturnType<typeof vi.fn<CashClosureRepository['requestExpense']>>;
    reviewExpense: ReturnType<typeof vi.fn<CashClosureRepository['reviewExpense']>>;
    submitClosure: ReturnType<typeof vi.fn<CashClosureRepository['submitClosure']>>;
    validateClosure: ReturnType<typeof vi.fn<CashClosureRepository['validateClosure']>>;
  };

  beforeEach(() => {
    repository = {
      listActiveCollectors: vi.fn(),
      getOwnDay: vi.fn(),
      listDay: vi.fn().mockResolvedValue([dayA, dayB]),
      registerOpening: vi.fn(),
      registerAllowance: vi.fn(),
      requestExpense: vi.fn(),
      reviewExpense: vi.fn(),
      submitClosure: vi.fn(),
      validateClosure: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [CashClosureStore, { provide: CASH_CLOSURE_REPOSITORY, useValue: repository }],
    });
    store = TestBed.inject(CashClosureStore);
  });

  it('loads every collector day and auto-selects the first one', async () => {
    await store.load();
    expect(store.days()).toEqual([dayA, dayB]);
    expect(store.selectedCollectorId()).toBe('collector-1');
  });

  it('computes the expected cash of the selected collector', async () => {
    await store.load();
    expect(store.selectedExpectedCash()).toBe(1100);
  });

  it('counts pending expenses across every collector', async () => {
    await store.load();
    expect(store.pendingExpenseCount()).toBe(1);
  });

  it('switches the selected collector', async () => {
    await store.load();
    store.selectCollector('collector-2');
    expect(store.selectedDay()?.collectorId).toBe('collector-2');
  });

  it('reloads the list when the business date changes', () => {
    store.setBusinessDate('2026-10-24');
    expect(store.businessDate()).toBe('2026-10-24');
    expect(repository.listDay).toHaveBeenCalledWith('2026-10-24');
  });

  it('registers an opening float and reloads', async () => {
    repository.registerOpening.mockResolvedValue(undefined);

    const result = await store.registerOpening({ collectorId: 'collector-1', amount: 1000, notes: '' });

    expect(result).toBe(true);
    expect(repository.registerOpening).toHaveBeenCalledWith({
      collectorId: 'collector-1',
      amount: 1000,
      notes: '',
      businessDate: store.businessDate(),
    });
  });

  it('sets an error when registering an opening float fails', async () => {
    repository.registerOpening.mockRejectedValue(
      new Error('Ya se registró la apertura de este cobrador para esta fecha.'),
    );

    const result = await store.registerOpening({ collectorId: 'collector-1', amount: 1000, notes: '' });

    expect(result).toBe(false);
    expect(store.error()).toBe('Ya se registró la apertura de este cobrador para esta fecha.');
  });

  it('reviews (approves) an expense and reloads', async () => {
    repository.reviewExpense.mockResolvedValue(undefined);

    const result = await store.reviewExpense({ expenseId: 'expense-1', approve: true, reason: '' });

    expect(result).toBe(true);
    expect(repository.reviewExpense).toHaveBeenCalledWith({
      expenseId: 'expense-1',
      approve: true,
      reason: '',
    });
  });

  it('validates a closure and reloads', async () => {
    repository.validateClosure.mockResolvedValue(undefined);

    const result = await store.validateClosure('closure-1', 'Todo conforme');

    expect(result).toBe(true);
    expect(repository.validateClosure).toHaveBeenCalledWith({
      closureId: 'closure-1',
      observation: 'Todo conforme',
    });
  });
});
