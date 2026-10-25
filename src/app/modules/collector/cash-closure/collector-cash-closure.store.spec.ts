import { TestBed } from '@angular/core/testing';
import { CashDayBreakdown, CashExpense, CollectorCashDay } from '../../../core/models/cash-closure.model';
import {
  CASH_CLOSURE_REPOSITORY,
  CashClosureRepository,
} from '../../../core/repositories/cash-closure.repository';
import { CollectorCashClosureStore } from './collector-cash-closure.store';

const breakdown: CashDayBreakdown = {
  collectorId: 'collector-1',
  businessDate: '2026-10-25',
  openingAmount: 1000,
  allowanceAmount: 100,
  cashCollectedAmount: 650,
  yapeCollectedAmount: 200,
  plinCollectedAmount: 0,
  transferCollectedAmount: 0,
  voidedCashAmount: 0,
  loanDisbursementAmount: 600,
  operatingExpenseAmount: 50,
};

const day: CollectorCashDay = {
  collectorId: 'collector-1',
  collectorName: '',
  businessDate: '2026-10-25',
  breakdown,
  closure: null,
  expenses: [],
};

describe('CollectorCashClosureStore', () => {
  let store: CollectorCashClosureStore;
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
      getOwnDay: vi.fn().mockResolvedValue(day),
      listDay: vi.fn(),
      registerOpening: vi.fn(),
      registerAllowance: vi.fn(),
      requestExpense: vi.fn(),
      reviewExpense: vi.fn(),
      submitClosure: vi.fn(),
      validateClosure: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        CollectorCashClosureStore,
        { provide: CASH_CLOSURE_REPOSITORY, useValue: repository },
      ],
    });
    store = TestBed.inject(CollectorCashClosureStore);
  });

  it('loads the collector own day', async () => {
    await store.load();
    expect(store.day()).toEqual(day);
    expect(repository.getOwnDay).toHaveBeenCalledWith(store.businessDate());
  });

  it('computes expected cash exactly as in the worked example (1000+100+650-600-50=1100)', async () => {
    await store.load();
    expect(store.expectedCash()).toBe(1100);
  });

  it('sets an error message when loading fails', async () => {
    repository.getOwnDay.mockRejectedValue(new Error('Sin conexión'));
    await store.load();
    expect(store.day()).toBeNull();
    expect(store.error()).toBe('Sin conexión');
  });

  it('requests an expense and reloads the day', async () => {
    const expense: CashExpense = {
      id: 'expense-1',
      collectorId: 'collector-1',
      businessDate: '2026-10-25',
      category: 'fuel',
      amount: 50,
      description: 'Combustible',
      status: 'pending',
      cashMovementId: null,
      requestedBy: 'collector-1',
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null,
      createdAt: '2026-10-25T18:00:00Z',
    };
    repository.requestExpense.mockResolvedValue(expense);

    const result = await store.requestExpense({ category: 'fuel', amount: 50, description: 'Combustible' });

    expect(result).toBe(true);
    expect(repository.requestExpense).toHaveBeenCalledWith({
      category: 'fuel',
      amount: 50,
      description: 'Combustible',
      businessDate: store.businessDate(),
    });
    expect(repository.getOwnDay).toHaveBeenCalledTimes(1);
  });

  it('sets an error when requesting an expense fails', async () => {
    repository.requestExpense.mockRejectedValue(new Error('El monto del gasto debe ser mayor que cero.'));

    const result = await store.requestExpense({ category: 'fuel', amount: 0, description: '' });

    expect(result).toBe(false);
    expect(store.error()).toBe('El monto del gasto debe ser mayor que cero.');
  });

  it('submits the closure and reloads the day', async () => {
    repository.submitClosure.mockResolvedValue({
      id: 'closure-1',
      collectorId: 'collector-1',
      businessDate: '2026-10-25',
      expectedAmount: 1100,
      deliveredAmount: 1100,
      differenceAmount: 0,
      status: 'submitted',
      observation: null,
      submittedAt: '2026-10-25T20:00:00Z',
      validatedAt: null,
      validatedBy: null,
    });

    const result = await store.submitClosure(1100, '');

    expect(result).toBe(true);
    expect(repository.submitClosure).toHaveBeenCalledWith({
      businessDate: store.businessDate(),
      deliveredAmount: 1100,
      observation: '',
    });
  });

  it('sets an error when submitting the closure fails', async () => {
    repository.submitClosure.mockRejectedValue(
      new Error('Ingresá una observación: el monto entregado no coincide con el esperado.'),
    );

    const result = await store.submitClosure(1200, '');

    expect(result).toBe(false);
    expect(store.error()).toBe(
      'Ingresá una observación: el monto entregado no coincide con el esperado.',
    );
  });
});
