import { TestBed } from '@angular/core/testing';
import { DailyControlReport } from '../../../core/models/daily-control.model';
import {
  DAILY_CONTROL_REPOSITORY,
  DailyControlRepository,
} from '../../../core/repositories/daily-control.repository';
import { DailyControlStore } from './daily-control.store';

const report: DailyControlReport = {
  filters: { businessDate: '2026-10-21', collectorId: null, status: 'all' },
  generatedAt: '2026-10-21T12:00:00.000Z',
  rows: [
    {
      loanId: 'loan-1', clientId: 'client-1', clientDni: '45678901',
      clientName: 'María López', collectorId: 'collector-1', collectorName: 'José Pérez',
      principalAmount: 300, totalAmount: 360, startedOn: '2026-10-01', endDate: '2026-10-30',
      installmentAmount: 12, scheduledOnDate: 12, collectedOnDate: 12, paidToDate: 180,
      balanceAsOf: 180, oldestUnpaidDueDate: '2026-10-18', overdueDays: 3, status: 'overdue',
    },
  ],
  summary: {
    scheduledAmount: 12, collectedAmount: 12, operationalDifference: 0,
    attendedClients: 1, overdueClients: 1,
  },
};

describe('DailyControlStore', () => {
  let store: DailyControlStore;
  let repository: {
    listCollectors: ReturnType<typeof vi.fn<DailyControlRepository['listCollectors']>>;
    getReport: ReturnType<typeof vi.fn<DailyControlRepository['getReport']>>;
  };

  beforeEach(() => {
    repository = {
      listCollectors: vi.fn<DailyControlRepository['listCollectors']>().mockResolvedValue([
        { id: 'collector-1', fullName: 'José Pérez' },
      ]),
      getReport: vi.fn<DailyControlRepository['getReport']>().mockResolvedValue(report),
    };
    TestBed.configureTestingModule({
      providers: [DailyControlStore, { provide: DAILY_CONTROL_REPOSITORY, useValue: repository }],
    });
    store = TestBed.inject(DailyControlStore);
  });

  it('loads collectors and the report together', async () => {
    await store.initialize();

    expect(store.collectors()).toEqual([{ id: 'collector-1', fullName: 'José Pérez' }]);
    expect(store.report()).toEqual(report);
  });

  it('searches names without requiring accents', async () => {
    await store.initialize();
    store.query.set('maria');

    expect(store.visibleReport()?.rows).toHaveLength(1);
    store.query.set('nombre inexistente');
    expect(store.visibleReport()?.summary).toMatchObject({ attendedClients: 0, overdueClients: 0 });
  });

  it('passes filter changes to the repository', async () => {
    await store.updateFilters({ collectorId: 'collector-1', status: 'overdue' });

    expect(repository.getReport).toHaveBeenCalledWith(
      expect.objectContaining({ collectorId: 'collector-1', status: 'overdue' }),
    );
  });
});
