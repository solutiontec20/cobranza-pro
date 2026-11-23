import { TestBed } from '@angular/core/testing';
import { AppError } from '../../../core/errors/app-error';
import {
  AnalyticsCollectorEntry,
  AnalyticsExpenseCategoryEntry,
  AnalyticsFinancialPoint,
} from '../../../core/models/analytics.model';
import {
  ANALYTICS_REPOSITORY,
  AnalyticsRepository,
} from '../../../core/repositories/analytics.repository';
import { AnalyticsStore } from './analytics.store';

const points: AnalyticsFinancialPoint[] = [
  {
    bucketStart: '2026-11-21',
    bucketEnd: '2026-11-21',
    collectedAmount: 80,
    interestCollected: 20,
    loanDisbursements: 50,
    operatingExpenses: 5,
    netProfit: 15,
    paymentsCount: 3,
  },
  {
    bucketStart: '2026-11-22',
    bucketEnd: '2026-11-22',
    collectedAmount: 0,
    interestCollected: 0,
    loanDisbursements: -10,
    operatingExpenses: 0,
    netProfit: 0,
    paymentsCount: 0,
  },
];

const collectors: AnalyticsCollectorEntry[] = [
  {
    collectorId: 'collector-1',
    name: 'Ana Torres',
    dni: '87654321',
    collectedAmount: 80,
    interestCollected: 20,
    paymentsCount: 3,
    clientsAttended: 2,
    loanDisbursements: 40,
    operatingExpenses: 5,
    netProfit: 15,
  },
];

const categories: AnalyticsExpenseCategoryEntry[] = [
  { category: 'fuel', expenseCount: 1, spentAmount: 5 },
];

describe('AnalyticsStore', () => {
  let store: AnalyticsStore;
  let repository: {
    listCollectors: ReturnType<typeof vi.fn<AnalyticsRepository['listCollectors']>>;
    getSeries: ReturnType<typeof vi.fn<AnalyticsRepository['getSeries']>>;
    getCollectorPerformance: ReturnType<
      typeof vi.fn<AnalyticsRepository['getCollectorPerformance']>
    >;
    getExpenseCategories: ReturnType<typeof vi.fn<AnalyticsRepository['getExpenseCategories']>>;
  };

  beforeEach(() => {
    repository = {
      listCollectors: vi
        .fn<AnalyticsRepository['listCollectors']>()
        .mockResolvedValue([{ id: 'collector-1', fullName: 'Ana Torres' }]),
      getSeries: vi.fn<AnalyticsRepository['getSeries']>().mockResolvedValue(points),
      getCollectorPerformance: vi
        .fn<AnalyticsRepository['getCollectorPerformance']>()
        .mockResolvedValue(collectors),
      getExpenseCategories: vi
        .fn<AnalyticsRepository['getExpenseCategories']>()
        .mockResolvedValue(categories),
    };
    TestBed.configureTestingModule({
      providers: [AnalyticsStore, { provide: ANALYTICS_REPOSITORY, useValue: repository }],
    });
    store = TestBed.inject(AnalyticsStore);
  });

  it('starts on a single day (today), not on the whole month, and requests nothing yet', () => {
    expect(store.preset()).toBe('day');
    expect(store.range()).toEqual({
      start: store.referenceDate(),
      end: store.referenceDate(),
    });
    expect(store.bucket()).toBe('day');
    expect(store.collectorId()).toBeNull();
    expect(repository.getSeries).not.toHaveBeenCalled();
  });

  it('asks for exactly the selected day', async () => {
    store.setReferenceDate('2026-11-22');
    await load();

    expect(repository.getSeries).toHaveBeenCalledWith(
      { start: '2026-11-22', end: '2026-11-22', bucket: 'day', collectorId: null },
      expect.any(AbortSignal),
    );
    expect(repository.getExpenseCategories).toHaveBeenCalledWith(
      { start: '2026-11-22', end: '2026-11-22', bucket: 'day', collectorId: null },
      expect.any(AbortSignal),
    );
  });

  it('asks for the Monday-to-Sunday week of the reference date', async () => {
    store.setReferenceDate('2026-11-22');
    store.setPreset('week');
    await load();

    expect(repository.getSeries).toHaveBeenLastCalledWith(
      { start: '2026-11-16', end: '2026-11-22', bucket: 'day', collectorId: null },
      expect.any(AbortSignal),
    );
  });

  it('asks for the whole calendar month with daily points', async () => {
    store.setReferenceDate('2026-11-22');
    store.setPreset('month');
    await load();

    expect(repository.getSeries).toHaveBeenLastCalledWith(
      { start: '2026-11-01', end: '2026-11-30', bucket: 'day', collectorId: null },
      expect.any(AbortSignal),
    );
  });

  it('asks for the whole calendar year with weekly points', async () => {
    store.setReferenceDate('2026-11-22');
    store.setPreset('year');
    await load();

    expect(repository.getSeries).toHaveBeenLastCalledWith(
      { start: '2026-01-01', end: '2026-12-31', bucket: 'week', collectorId: null },
      expect.any(AbortSignal),
    );
  });

  it('starts a custom range from the period being viewed and accepts a new valid range', async () => {
    store.setReferenceDate('2026-11-22');
    store.setPreset('week');
    store.setPreset('custom');

    expect(store.range()).toEqual({ start: '2026-11-16', end: '2026-11-22' });
    expect(store.canShift()).toBe(false);

    expect(store.setCustomRange('2026-11-01', '2026-11-10')).toBe(true);
    await load();

    expect(repository.getSeries).toHaveBeenLastCalledWith(
      { start: '2026-11-01', end: '2026-11-10', bucket: 'day', collectorId: null },
      expect.any(AbortSignal),
    );
  });

  it('rejects an invalid custom range without changing the current one', () => {
    store.setPreset('custom');
    const before = store.range();

    expect(store.setCustomRange('2026-11-10', '2026-11-09')).toBe(false);
    expect(store.setCustomRange('2026-02-31', '2026-03-01')).toBe(false);
    expect(store.setCustomRange('', '')).toBe(false);
    expect(store.range()).toEqual(before);
  });

  it('rejects an invalid reference date before querying', async () => {
    store.setReferenceDate('2026-11-22');
    await load();
    repository.getSeries.mockClear();

    expect(store.setReferenceDate('')).toBe(false);
    expect(store.setReferenceDate('2026-02-31')).toBe(false);
    TestBed.tick();
    await Promise.resolve();

    expect(store.referenceDate()).toBe('2026-11-22');
    expect(repository.getSeries).not.toHaveBeenCalled();
  });

  it('moves to the previous and next day, week, month and year', async () => {
    store.setReferenceDate('2026-03-31');
    await load();

    store.shiftPeriod(-1);
    expect(store.referenceDate()).toBe('2026-03-30');

    store.setPreset('month');
    store.shiftPeriod(-1);
    expect(store.referenceDate()).toBe('2026-02-28');

    store.setPreset('week');
    store.shiftPeriod(1);
    expect(store.referenceDate()).toBe('2026-03-07');

    store.setPreset('year');
    store.shiftPeriod(-1);
    expect(store.referenceDate()).toBe('2025-03-07');
  });

  it('does not move a custom range', () => {
    store.setPreset('custom');
    store.setCustomRange('2026-11-01', '2026-11-10');
    store.shiftPeriod(1);

    expect(store.range()).toEqual({ start: '2026-11-01', end: '2026-11-10' });
  });

  it('filters series and categories by collector but keeps comparing every collector', async () => {
    store.setReferenceDate('2026-11-22');
    await load();
    repository.getSeries.mockClear();
    repository.getExpenseCategories.mockClear();
    repository.getCollectorPerformance.mockClear();

    store.setCollector('collector-1');
    TestBed.tick();

    await vi.waitFor(() => expect(repository.getSeries).toHaveBeenCalledOnce());
    expect(repository.getSeries).toHaveBeenCalledWith(
      expect.objectContaining({ collectorId: 'collector-1' }),
      expect.any(AbortSignal),
    );
    expect(repository.getExpenseCategories).toHaveBeenCalledWith(
      expect.objectContaining({ collectorId: 'collector-1' }),
      expect.any(AbortSignal),
    );
    expect(repository.getCollectorPerformance).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(store.selectedCollectorName()).toBe('Ana Torres'));
  });

  it('derives totals, activity, collectors and categories from the loaded data', async () => {
    await load();

    expect(store.totals()).toEqual({
      collectedAmount: 80,
      interestCollected: 20,
      loanDisbursements: 40,
      operatingExpenses: 5,
      netProfit: 15,
      paymentsCount: 3,
    });
    expect(store.hasActivity()).toBe(true);
    expect(store.collectors()).toEqual(collectors);
    expect(store.categories()).toEqual(categories);
  });

  it('reports no activity when nothing moved on the selected day', async () => {
    repository.getSeries.mockResolvedValue([
      {
        ...points[0],
        collectedAmount: 0,
        interestCollected: 0,
        loanDisbursements: 0,
        operatingExpenses: 0,
        netProfit: 0,
        paymentsCount: 0,
      },
    ]);
    repository.getCollectorPerformance.mockResolvedValue([]);
    repository.getExpenseCategories.mockResolvedValue([]);

    TestBed.tick();
    await vi.waitFor(() => expect(repository.getSeries).toHaveBeenCalled());
    await vi.waitFor(() => expect(store.loading()).toBe(false));

    expect(store.hasActivity()).toBe(false);
  });

  it('aborts the previous request and ignores its late response', async () => {
    const requests: Array<{
      signal: AbortSignal;
      resolve: (value: AnalyticsFinancialPoint[]) => void;
    }> = [];
    repository.getSeries.mockImplementation(
      (_query, signal) =>
        new Promise<AnalyticsFinancialPoint[]>((resolve) => {
          requests.push({ signal: signal!, resolve });
        }),
    );

    TestBed.tick();
    await vi.waitFor(() => expect(requests).toHaveLength(1));

    store.setPreset('week');
    TestBed.tick();
    await vi.waitFor(() => expect(requests).toHaveLength(2));

    store.setPreset('month');
    TestBed.tick();
    await vi.waitFor(() => expect(requests).toHaveLength(3));

    expect(requests[0].signal.aborted).toBe(true);
    expect(requests[1].signal.aborted).toBe(true);
    expect(requests[2].signal.aborted).toBe(false);

    requests[2].resolve([{ ...points[0], netProfit: 40 }]);
    await vi.waitFor(() => expect(store.series()[0]?.netProfit).toBe(40));

    requests[1].resolve([{ ...points[0], netProfit: 10 }]);
    await Promise.resolve();

    expect(store.preset()).toBe('month');
    expect(store.series()[0].netProfit).toBe(40);
  });

  it('exposes a user-facing message when loading fails and recovers on retry', async () => {
    repository.getSeries.mockRejectedValueOnce(
      new AppError('SUPABASE_RPC', 'No se pudo cargar la información de analíticas.'),
    );

    TestBed.tick();
    await vi.waitFor(() =>
      expect(store.error()).toBe('No se pudo cargar la información de analíticas.'),
    );
    expect(store.series()).toEqual([]);

    store.retry();
    TestBed.tick();

    await vi.waitFor(() => expect(store.series()).toEqual(points));
    expect(store.error()).toBeNull();
  });

  async function load(): Promise<void> {
    TestBed.tick();
    await vi.waitFor(() => {
      expect(store.series()).toEqual(points);
      expect(store.collectors()).toEqual(collectors);
      expect(store.categories()).toEqual(categories);
    });
  }
});
