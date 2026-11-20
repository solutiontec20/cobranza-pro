import { TestBed } from '@angular/core/testing';
import { SUPABASE } from '../supabase/supabase-client';
import { SupabaseAdminDashboardRepository } from './supabase-admin-dashboard.repository';

function summaryRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    capital_prestado: 310,
    total_esperado: 372,
    total_cobrado: 5,
    saldo_pendiente: 95,
    total_clientes: 6,
    prestamos_pagados: 1,
    cobradores: 1,
    risk_green: 1,
    risk_yellow: 1,
    risk_orange: 1,
    risk_red: 1,
    ...overrides,
  };
}

function performanceRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    collector_id: 'collector-1',
    collector_name: 'DB Collector A',
    collector_dni: '91000003',
    clients_count: 6,
    expected_today: 10,
    collected_today: 5,
    pending_today: 5,
    delayed_count: 3,
    ...overrides,
  };
}

describe('SupabaseAdminDashboardRepository', () => {
  const rpc = vi.fn();
  let repository: SupabaseAdminDashboardRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [SupabaseAdminDashboardRepository, { provide: SUPABASE, useValue: { rpc } }],
    });
    repository = TestBed.inject(SupabaseAdminDashboardRepository);
  });

  it('maps the summary RPC row, deriving morosidad from the red bucket and bucket percentages', async () => {
    rpc.mockResolvedValueOnce({ data: [summaryRow()], error: null });

    const summary = await repository.getSummary();

    expect(rpc).toHaveBeenCalledWith('admin_dashboard_summary');
    expect(summary).toEqual({
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
    });
  });

  it('throws when the summary RPC returns no row', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });

    await expect(repository.getSummary()).rejects.toMatchObject({ code: 'SUPABASE_RPC' });
  });

  it('maps collector performance rows', async () => {
    rpc.mockResolvedValueOnce({ data: [performanceRow()], error: null });

    const performance = await repository.listCollectorPerformance();

    expect(rpc).toHaveBeenCalledWith('admin_dashboard_collector_performance');
    expect(performance).toEqual([
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
    ]);
  });

  it('translates an authorization error into a user-facing AppError', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'Only administrators or supervisors may view the dashboard' },
    });

    await expect(repository.getSummary()).rejects.toMatchObject({ code: 'AUTH_UNAUTHORIZED' });
  });
});
