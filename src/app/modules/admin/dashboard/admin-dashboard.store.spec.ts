import { TestBed } from '@angular/core/testing';
import { AdminDashboardSummary, CollectorPerformanceEntry } from '../../../core/models/admin-dashboard.model';
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

describe('AdminDashboardStore', () => {
  let store: AdminDashboardStore;
  let repository: {
    getSummary: ReturnType<typeof vi.fn<AdminDashboardRepository['getSummary']>>;
    listCollectorPerformance: ReturnType<typeof vi.fn<AdminDashboardRepository['listCollectorPerformance']>>;
  };

  beforeEach(() => {
    repository = {
      getSummary: vi.fn<AdminDashboardRepository['getSummary']>().mockResolvedValue(summary),
      listCollectorPerformance: vi
        .fn<AdminDashboardRepository['listCollectorPerformance']>()
        .mockResolvedValue(performance),
    };
    TestBed.configureTestingModule({
      providers: [AdminDashboardStore, { provide: ADMIN_DASHBOARD_REPOSITORY, useValue: repository }],
    });
    store = TestBed.inject(AdminDashboardStore);
  });

  it('starts with no data loaded', () => {
    expect(store.summary()).toBeNull();
    expect(store.collectorPerformance()).toEqual([]);
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('loads the summary and collector performance together', async () => {
    await store.load();

    expect(store.summary()).toEqual(summary);
    expect(store.collectorPerformance()).toEqual(performance);
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('surfaces a user-facing message when loading fails', async () => {
    repository.getSummary.mockRejectedValueOnce(new Error('boom'));

    await store.load();

    expect(store.error()).toBe('boom');
    expect(store.loading()).toBe(false);
  });
});
