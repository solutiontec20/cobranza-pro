import { TestBed } from '@angular/core/testing';
import { LoanRepository, LOAN_REPOSITORY } from '../../../core/repositories/loan.repository';
import { LoansStore } from './loans.store';

describe('LoansStore server pagination', () => {
  let store: LoansStore;
  let repository: {
    listPage: ReturnType<typeof vi.fn<LoanRepository['listPage']>>;
    listAvailableClients: ReturnType<typeof vi.fn<LoanRepository['listAvailableClients']>>;
    listCollectorOptions: ReturnType<typeof vi.fn<LoanRepository['listCollectorOptions']>>;
  };

  beforeEach(() => {
    repository = {
      listPage: vi.fn<LoanRepository['listPage']>().mockResolvedValue({ items: [], total: 87 }),
      listAvailableClients: vi.fn<LoanRepository['listAvailableClients']>().mockResolvedValue([]),
      listCollectorOptions: vi
        .fn<LoanRepository['listCollectorOptions']>()
        .mockResolvedValue([{ id: 'collector-1', fullName: 'Collector One' }]),
    };

    TestBed.configureTestingModule({
      providers: [LoansStore, { provide: LOAN_REPOSITORY, useValue: repository }],
    });
    store = TestBed.inject(LoansStore);
  });

  it('loads only the requested server page and exposes the total count', async () => {
    await store.load();

    expect(repository.listPage).toHaveBeenCalledWith({
      pageIndex: 0,
      pageSize: 10,
      search: '',
      status: null,
      collectorId: null,
      frequency: null,
    });
    expect(store.totalRecords()).toBe(87);
    expect(store.collectorOptions()).toEqual([{ id: 'collector-1', fullName: 'Collector One' }]);
  });

  it('requests the next server page instead of slicing client-side rows', async () => {
    await store.setPage(10, 10);

    expect(repository.listPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageIndex: 1, pageSize: 10 }),
    );
  });

  it('returns to the first page when search changes', async () => {
    store.pageIndex.set(3);

    await store.setSearch('alvaro');

    expect(store.pageIndex()).toBe(0);
    expect(repository.listPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageIndex: 0, search: 'alvaro' }),
    );
  });

  it('keeps a full reload result when an older page request finishes later', async () => {
    let resolveOlderPage!: (value: { items: []; total: number }) => void;
    repository.listPage
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveOlderPage = resolve as typeof resolveOlderPage)),
      )
      .mockResolvedValueOnce({ items: [], total: 88 });

    const olderPageRequest = store.setPage(10, 10);
    await store.load();
    resolveOlderPage({ items: [], total: 20 });
    await olderPageRequest;

    expect(store.totalRecords()).toBe(88);
  });

  it('keeps a newer filtered page when an older full reload finishes later', async () => {
    let resolveOlderLoad!: (value: { items: []; total: number }) => void;
    repository.listPage
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveOlderLoad = resolve as typeof resolveOlderLoad)),
      )
      .mockResolvedValueOnce({ items: [], total: 88 });

    const olderLoad = store.load();
    await store.setSearch('ana');
    resolveOlderLoad({ items: [], total: 20 });
    await olderLoad;

    expect(store.totalRecords()).toBe(88);
    expect(store.query()).toBe('ana');
  });
});
