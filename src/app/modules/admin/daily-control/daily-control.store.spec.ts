import { TestBed } from '@angular/core/testing';
import { AppError } from '../../../core/errors/app-error';
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

  it('loads collectors and the report independently', async () => {
    await store.initialize();
    await waitForReport();

    expect(store.collectors()).toEqual([{ id: 'collector-1', fullName: 'José Pérez' }]);
    expect(store.report()).toEqual(report);
  });

  it('searches locally without requesting another report', async () => {
    await waitForReport();
    repository.getReport.mockClear();

    store.query.set('maria');
    expect(store.visibleReport()?.rows).toHaveLength(1);
    store.query.set('nombre inexistente');
    expect(store.visibleReport()?.summary).toMatchObject({ attendedClients: 0, overdueClients: 0 });
    expect(repository.getReport).not.toHaveBeenCalled();
  });

  it('reactively passes filter changes to the repository', async () => {
    await waitForReport();
    repository.getReport.mockClear();

    store.updateFilters({ collectorId: 'collector-1', status: 'overdue' });
    TestBed.tick();

    await vi.waitFor(() => {
      expect(repository.getReport).toHaveBeenCalledWith(
        expect.objectContaining({ collectorId: 'collector-1', status: 'overdue' }),
        expect.any(AbortSignal),
      );
    });
  });

  it('aborts the previous request when filters change', async () => {
    const requests: Array<{
      signal: AbortSignal;
      resolve: (value: DailyControlReport) => void;
    }> = [];
    repository.getReport.mockImplementation((_filters, signal) =>
      new Promise<DailyControlReport>((resolve) => {
        requests.push({ signal: signal!, resolve });
      }),
    );

    TestBed.tick();
    await vi.waitFor(() => expect(requests).toHaveLength(1));

    store.updateFilters({ collectorId: 'collector-1' });
    TestBed.tick();
    await vi.waitFor(() => expect(requests).toHaveLength(2));

    expect(requests[0].signal.aborted).toBe(true);
    requests[1].resolve(report);
    await vi.waitFor(() => expect(store.report()).toEqual(report));
  });

  it('reloads the report with the current filters', async () => {
    await waitForReport();
    repository.getReport.mockClear();

    store.reload();
    TestBed.tick();

    await vi.waitFor(() => expect(repository.getReport).toHaveBeenCalledOnce());
    expect(repository.getReport).toHaveBeenCalledWith(store.filters(), expect.any(AbortSignal));
  });

  it('refreshes collectors and the report together', async () => {
    await store.initialize();
    await waitForReport();
    repository.listCollectors.mockClear();
    repository.getReport.mockClear();

    await store.refresh();
    TestBed.tick();

    await vi.waitFor(() => expect(repository.getReport).toHaveBeenCalledOnce());
    expect(repository.listCollectors).toHaveBeenCalledOnce();
    expect(repository.getReport).toHaveBeenCalledWith(store.filters(), expect.any(AbortSignal));
  });

  it('keeps a valid report visible when loading collectors fails', async () => {
    repository.listCollectors.mockRejectedValueOnce(
      new AppError('SUPABASE_RPC', 'No se pudieron cargar los cobradores.'),
    );

    await store.initialize();
    await waitForReport();

    expect(store.report()).toEqual(report);
    expect(store.error()).toBe('No se pudieron cargar los cobradores.');
  });

  it('exposes a repository report error through AppError', async () => {
    repository.getReport.mockRejectedValueOnce(
      new AppError('SUPABASE_RPC', 'No se pudo generar el reporte.'),
    );

    TestBed.tick();

    await vi.waitFor(() => expect(store.error()).toBe('No se pudo generar el reporte.'));
    expect(store.report()).toBeNull();
  });

  async function waitForReport(): Promise<void> {
    TestBed.tick();
    await vi.waitFor(() => expect(store.report()).toEqual(report));
  }
});
