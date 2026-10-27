import { TestBed } from '@angular/core/testing';
import { DailyControlRow } from '../models/daily-control.model';
import { SUPABASE } from '../supabase/supabase-client';
import { SupabaseDailyControlRepository } from './supabase-daily-control.repository';

/** A query-builder stub that stays chainable through any number of .select()/.eq()/.order()
 * calls and resolves to `result` the moment it is awaited. */
function chain(result: { data: unknown; error: unknown }) {
  const node: Record<string, unknown> = {};
  node['select'] = vi.fn(() => node);
  node['eq'] = vi.fn(() => node);
  node['order'] = vi.fn(() => node);
  node['then'] = (resolve: (value: unknown) => unknown) => resolve(result);
  return node;
}

function reportRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    loan_id: 'loan-1',
    customer_id: 'client-1',
    client_dni: '45678901',
    client_name: 'María López',
    collector_id: 'collector-1',
    collector_name: 'José Pérez',
    principal_amount: 300,
    total_amount: 360,
    started_on: '2026-10-01',
    end_date: '2026-10-30',
    installment_amount: 12,
    scheduled_on_date: 12,
    collected_on_date: 0,
    paid_to_date: 180,
    balance_as_of: 180,
    oldest_unpaid_due_date: '2026-10-18',
    overdue_days: 3,
    ...overrides,
  };
}

describe('SupabaseDailyControlRepository', () => {
  const from = vi.fn<(table: string) => unknown>();
  const rpc = vi.fn();
  let repository: SupabaseDailyControlRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [SupabaseDailyControlRepository, { provide: SUPABASE, useValue: { from, rpc } }],
    });
    repository = TestBed.inject(SupabaseDailyControlRepository);
  });

  it('lists active collectors ordered by name', async () => {
    from.mockReturnValueOnce(
      chain({ data: [{ id: 'collector-1', full_name: 'José Pérez' }], error: null }),
    );

    await expect(repository.listCollectors()).resolves.toEqual([
      { id: 'collector-1', fullName: 'José Pérez' },
    ]);
  });

  it('maps the RPC rows into a report, deriving status from balance and overdue days', async () => {
    rpc.mockResolvedValueOnce({ data: [reportRow()], error: null });

    const report = await repository.getReport({
      businessDate: '2026-10-21',
      collectorId: null,
      status: 'all',
    });

    expect(rpc).toHaveBeenCalledWith('admin_daily_control_report', {
      p_business_date: '2026-10-21',
      p_collector_id: undefined,
    });
    expect(report.rows).toEqual<DailyControlRow[]>([
      {
        loanId: 'loan-1', clientId: 'client-1', clientDni: '45678901',
        clientName: 'María López', collectorId: 'collector-1', collectorName: 'José Pérez',
        principalAmount: 300, totalAmount: 360, startedOn: '2026-10-01', endDate: '2026-10-30',
        installmentAmount: 12, scheduledOnDate: 12, collectedOnDate: 0, paidToDate: 180,
        balanceAsOf: 180, oldestUnpaidDueDate: '2026-10-18', overdueDays: 3, status: 'overdue',
      },
    ]);
    expect(report.summary).toEqual({
      scheduledAmount: 12,
      collectedAmount: 0,
      operationalDifference: 12,
      attendedClients: 0,
      overdueClients: 1,
    });
  });

  it('derives "paid" status once the balance reaches zero, regardless of overdue days', async () => {
    rpc.mockResolvedValueOnce({
      data: [reportRow({ balance_as_of: 0, overdue_days: 0, oldest_unpaid_due_date: null })],
      error: null,
    });

    const report = await repository.getReport({
      businessDate: '2026-10-21',
      collectorId: null,
      status: 'all',
    });

    expect(report.rows[0].status).toBe('paid');
  });

  it('derives "on_track" status when there is a balance but nothing overdue yet', async () => {
    rpc.mockResolvedValueOnce({
      data: [reportRow({ balance_as_of: 40, overdue_days: 0, oldest_unpaid_due_date: null })],
      error: null,
    });

    const report = await repository.getReport({
      businessDate: '2026-10-21',
      collectorId: null,
      status: 'all',
    });

    expect(report.rows[0].status).toBe('on_track');
  });

  it('forwards the collector filter to the RPC and filters rows by status locally', async () => {
    rpc.mockResolvedValueOnce({
      data: [
        reportRow({ loan_id: 'loan-overdue', balance_as_of: 40, overdue_days: 2 }),
        reportRow({ loan_id: 'loan-paid', balance_as_of: 0, overdue_days: 0, oldest_unpaid_due_date: null }),
      ],
      error: null,
    });

    const report = await repository.getReport({
      businessDate: '2026-10-21',
      collectorId: 'collector-1',
      status: 'overdue',
    });

    expect(rpc).toHaveBeenCalledWith('admin_daily_control_report', {
      p_business_date: '2026-10-21',
      p_collector_id: 'collector-1',
    });
    expect(report.rows.map((row) => row.loanId)).toEqual(['loan-overdue']);
  });

  it('translates an RPC error into a user-facing AppError', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'Only administrators or supervisors may view the daily control report' },
    });

    await expect(
      repository.getReport({ businessDate: '2026-10-21', collectorId: null, status: 'all' }),
    ).rejects.toMatchObject({ code: 'AUTH_UNAUTHORIZED' });
  });
});
