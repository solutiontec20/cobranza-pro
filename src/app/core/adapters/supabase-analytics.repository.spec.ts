import { TestBed } from '@angular/core/testing';
import { AnalyticsQuery } from '../models/analytics.model';
import { SUPABASE } from '../supabase/supabase-client';
import { SupabaseAnalyticsRepository } from './supabase-analytics.repository';

/** A query-builder stub that stays chainable and resolves to `result` when awaited. */
function chain(result: { data: unknown; error: unknown }) {
  const node: Record<string, unknown> = {};
  node['select'] = vi.fn(() => node);
  node['eq'] = vi.fn(() => node);
  node['order'] = vi.fn(() => node);
  node['then'] = (resolve: (value: unknown) => unknown) => resolve(result);
  return node;
}

const dayQuery: AnalyticsQuery = {
  start: '2026-11-22',
  end: '2026-11-22',
  bucket: 'day',
  collectorId: null,
};

describe('SupabaseAnalyticsRepository', () => {
  const rpc = vi.fn();
  const from = vi.fn<(table: string) => unknown>();
  let repository: SupabaseAnalyticsRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [SupabaseAnalyticsRepository, { provide: SUPABASE, useValue: { rpc, from } }],
    });
    repository = TestBed.inject(SupabaseAnalyticsRepository);
  });

  it('lists active collectors ordered by name', async () => {
    from.mockReturnValueOnce(
      chain({ data: [{ id: 'collector-1', full_name: 'Ana Torres' }], error: null }),
    );

    await expect(repository.listCollectors()).resolves.toEqual([
      { id: 'collector-1', fullName: 'Ana Torres' },
    ]);
    expect(from).toHaveBeenCalledWith('profiles');
  });

  it('calls the series RPC with the exact range, bucket and collector, and maps numbers', async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          bucket_start: '2026-11-22',
          bucket_end: '2026-11-22',
          collected_amount: '100.25',
          interest_collected: '20.05',
          loan_disbursements: '75.00',
          operating_expenses: '5.50',
          net_profit: '14.55',
          payments_count: 4,
        },
      ],
      error: null,
    });

    const series = await repository.getSeries({ ...dayQuery, collectorId: 'collector-1' });

    expect(rpc).toHaveBeenCalledWith('admin_analytics_series', {
      p_start: '2026-11-22',
      p_end: '2026-11-22',
      p_bucket: 'day',
      p_collector_id: 'collector-1',
    });
    expect(series).toEqual([
      {
        bucketStart: '2026-11-22',
        bucketEnd: '2026-11-22',
        collectedAmount: 100.25,
        interestCollected: 20.05,
        loanDisbursements: 75,
        operatingExpenses: 5.5,
        netProfit: 14.55,
        paymentsCount: 4,
      },
    ]);
  });

  it('omits the collector argument when the whole business is requested', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });

    await expect(repository.getSeries(dayQuery)).resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledWith('admin_analytics_series', {
      p_start: '2026-11-22',
      p_end: '2026-11-22',
      p_bucket: 'day',
      p_collector_id: undefined,
    });
  });

  it('maps the per collector breakdown and never sends a collector filter', async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          collector_id: 'collector-1',
          collector_name: 'Ana Torres',
          collector_dni: '87654321',
          collected_amount: '80.00',
          interest_collected: '13.33',
          payments_count: 3,
          clients_attended: 2,
          loan_disbursements: '40.00',
          operating_expenses: '5.00',
          net_profit: '8.33',
        },
      ],
      error: null,
    });

    const result = await repository.getCollectorPerformance({
      ...dayQuery,
      collectorId: 'collector-1',
    });

    expect(rpc).toHaveBeenCalledWith('admin_analytics_collectors', {
      p_start: '2026-11-22',
      p_end: '2026-11-22',
    });
    expect(result).toEqual([
      {
        collectorId: 'collector-1',
        name: 'Ana Torres',
        dni: '87654321',
        collectedAmount: 80,
        interestCollected: 13.33,
        paymentsCount: 3,
        clientsAttended: 2,
        loanDisbursements: 40,
        operatingExpenses: 5,
        netProfit: 8.33,
      },
    ]);
  });

  it('maps expense categories for the range and collector', async () => {
    rpc.mockResolvedValueOnce({
      data: [{ category: 'fuel', expense_count: 2, spent_amount: '12.50' }],
      error: null,
    });

    const result = await repository.getExpenseCategories({
      ...dayQuery,
      collectorId: 'collector-1',
    });

    expect(rpc).toHaveBeenCalledWith('admin_analytics_expense_categories', {
      p_start: '2026-11-22',
      p_end: '2026-11-22',
      p_collector_id: 'collector-1',
    });
    expect(result).toEqual([{ category: 'fuel', expenseCount: 2, spentAmount: 12.5 }]);
  });

  it('forwards an AbortSignal to the RPC request', async () => {
    const abortSignal = new AbortController().signal;
    const abortRequest = vi.fn().mockResolvedValue({ data: [], error: null });
    rpc.mockReturnValueOnce({ abortSignal: abortRequest });

    await repository.getSeries(dayQuery, abortSignal);

    expect(abortRequest).toHaveBeenCalledWith(abortSignal);
  });

  it('translates the role check into a user-facing unauthorized error', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'Only administrators or supervisors may view analytics' },
    });

    await expect(repository.getSeries(dayQuery)).rejects.toMatchObject({
      code: 'AUTH_UNAUTHORIZED',
      message: 'Solo un administrador o supervisor puede ver las analíticas.',
    });
  });

  it('translates a missing application profile and generic permission failures', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'Active application profile required' },
    });
    await expect(repository.getSeries(dayQuery)).rejects.toMatchObject({
      code: 'AUTH_UNAUTHORIZED',
    });

    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'denied' } });
    await expect(repository.getSeries(dayQuery)).rejects.toMatchObject({
      code: 'AUTH_UNAUTHORIZED',
    });
  });

  it('translates range validation errors into Spanish validation messages', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '22023', message: 'End date must not precede start date' },
    });
    await expect(repository.getSeries(dayQuery)).rejects.toMatchObject({
      code: 'VALIDATION',
      message: 'La fecha final no puede ser anterior a la inicial.',
    });

    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '22023', message: 'Date range is too large' },
    });
    await expect(repository.getSeries(dayQuery)).rejects.toMatchObject({
      code: 'VALIDATION',
      message: 'El rango de fechas no puede superar los 10 años.',
    });
  });

  it('falls back to a safe Spanish message without leaking the raw database error', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '57014', message: 'canceling statement due to statement timeout' },
    });

    await expect(repository.getSeries(dayQuery)).rejects.toMatchObject({
      code: 'SUPABASE_RPC',
      message: 'No se pudo cargar la información de analíticas.',
    });
  });
});
