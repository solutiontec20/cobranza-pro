import { TestBed } from '@angular/core/testing';
import {
  AdminDashboardSummary,
  CollectorPerformanceEntry,
  DashboardFinancialPoint,
} from '../../../core/models/admin-dashboard.model';
import {
  ADMIN_DASHBOARD_REPOSITORY,
  AdminDashboardRepository,
} from '../../../core/repositories/admin-dashboard.repository';
import { AdminDashboardStore } from './admin-dashboard.store';

const summary: AdminDashboardSummary = {
  capitalPrestado: 310,
  totalEsperado: 372,
  totalCobrado: 5,
  saldoPendiente: 95,
  totalClientes: 6,
  prestamosPagados: 1,
  cobradores: 1,
  morosidad: 1,
  riskDistribution: {
    green: { count: 1, percent: 25 },
    yellow: { count: 1, percent: 25 },
    orange: { count: 1, percent: 25 },
    red: { count: 1, percent: 25 },
  },
};

const performance: CollectorPerformanceEntry[] = [
  {
    id: 'collector-1',
    name: 'DB Collector A',
    dni: '91000003',
    clientsCount: 6,
    expectedToday: 10,
    collectedToday: 5,
    pendingToday: 5,
    delayedCount: 3,
  },
];

const financialSeries: DashboardFinancialPoint[] = [
  {
    bucketStart: '2026-11-01',
    bucketEnd: '2026-11-01',
    collectedAmount: 80,
    interestCollected: 20,
    loanDisbursements: 50,
    operatingExpenses: 5,
    netProfit: 15,
  },
];

describe('AdminDashboardStore', () => {
  let store: AdminDashboardStore;
  let repository: {
    getSummary: ReturnType<typeof vi.fn<AdminDashboardRepository['getSummary']>>;
    listCollectorPerformance: ReturnType<
      typeof vi.fn<AdminDashboardRepository['listCollectorPerformance']>
    >;
    getFinancialSeries: ReturnType<typeof vi.fn<AdminDashboardRepository['getFinancialSeries']>>;
  };

  beforeEach(() => {
    repository = {
      getSummary: vi.fn<AdminDashboardRepository['getSummary']>().mockResolvedValue(summary),
      listCollectorPerformance: vi
        .fn<AdminDashboardRepository['listCollectorPerformance']>()
        .mockResolvedValue(performance),
      getFinancialSeries: vi
        .fn<AdminDashboardRepository['getFinancialSeries']>()
        .mockResolvedValue(financialSeries),
    };
    TestBed.configureTestingModule({
      providers: [
        AdminDashboardStore,
        { provide: ADMIN_DASHBOARD_REPOSITORY, useValue: repository },
      ],
    });
    store = TestBed.inject(AdminDashboardStore);
  });

  it('starts with no data loaded', () => {
    expect(store.summary()).toBeNull();
    expect(store.collectorPerformance()).toEqual([]);
    expect(store.financialGranularity()).toBe('daily');
    expect(store.financialSeries()).toEqual([]);
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('loads the summary, collector performance, and daily financial series together', async () => {
    await store.load();

    expect(store.summary()).toEqual(summary);
    expect(store.collectorPerformance()).toEqual(performance);
    expect(store.financialSeries()).toEqual(financialSeries);
    expect(repository.getFinancialSeries).toHaveBeenCalledWith({
      granularity: 'daily',
      referenceDate: store.referenceDate(),
    });
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('reloads only the financial series when its shared period changes', async () => {
    await store.load();
    repository.getFinancialSeries.mockClear();
    repository.getSummary.mockClear();
    repository.listCollectorPerformance.mockClear();

    await store.setFinancialGranularity('weekly');

    expect(repository.getFinancialSeries).toHaveBeenCalledWith({
      granularity: 'weekly',
      referenceDate: store.referenceDate(),
    });
    expect(repository.getSummary).not.toHaveBeenCalled();
    expect(repository.listCollectorPerformance).not.toHaveBeenCalled();
  });

  it('keeps only the latest financial-series response when filters change quickly', async () => {
    let resolveWeekly!: (value: DashboardFinancialPoint[]) => void;
    repository.getFinancialSeries
      .mockResolvedValueOnce(financialSeries)
      .mockImplementationOnce(
        () => new Promise<DashboardFinancialPoint[]>((resolve) => (resolveWeekly = resolve)),
      )
      .mockResolvedValueOnce([{ ...financialSeries[0], netProfit: 40 }]);
    await store.load();

    const weeklyLoad = store.setFinancialGranularity('weekly');
    const monthlyLoad = store.setFinancialGranularity('monthly');
    await monthlyLoad;
    resolveWeekly([{ ...financialSeries[0], netProfit: 10 }]);
    await weeklyLoad;

    expect(store.financialGranularity()).toBe('monthly');
    expect(store.financialSeries()[0].netProfit).toBe(40);
  });

  it('surfaces a user-facing message when loading fails', async () => {
    repository.getSummary.mockRejectedValueOnce(new Error('boom'));

    await store.load();

    expect(store.error()).toBe('boom');
    expect(store.loading()).toBe(false);
  });
});
