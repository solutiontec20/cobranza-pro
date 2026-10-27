import { inject, Service } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../errors/app-error';
import { AdminDashboardSummary, CollectorPerformanceEntry } from '../models/admin-dashboard.model';
import { AdminDashboardRepository } from '../repositories/admin-dashboard.repository';
import { Database } from '../supabase/database.types';
import { SUPABASE } from '../supabase/supabase-client';

type SummaryRow = Database['public']['Functions']['admin_dashboard_summary']['Returns'][number];
type PerformanceRow =
  Database['public']['Functions']['admin_dashboard_collector_performance']['Returns'][number];

@Service({ autoProvided: false })
export class SupabaseAdminDashboardRepository implements AdminDashboardRepository {
  private readonly supabase = inject(SUPABASE) as SupabaseClient<Database>;

  async getSummary(): Promise<AdminDashboardSummary> {
    const { data, error } = await this.supabase.rpc('admin_dashboard_summary');

    if (error) {
      throw this.dashboardError(error);
    }

    const row = data?.[0];
    if (!row) {
      throw new AppError('SUPABASE_RPC', 'El resumen del dashboard no devolvió datos.');
    }

    return this.toSummary(row);
  }

  async listCollectorPerformance(): Promise<CollectorPerformanceEntry[]> {
    const { data, error } = await this.supabase.rpc('admin_dashboard_collector_performance');

    if (error) {
      throw this.dashboardError(error);
    }

    return (data ?? []).map((row) => this.toPerformanceEntry(row));
  }

  private toSummary(row: SummaryRow): AdminDashboardSummary {
    const riskGreen = Number(row.risk_green);
    const riskYellow = Number(row.risk_yellow);
    const riskOrange = Number(row.risk_orange);
    const riskRed = Number(row.risk_red);
    const totalRisk = riskGreen + riskYellow + riskOrange + riskRed || 1;

    const bucket = (count: number) => ({ count, percent: Math.round((count / totalRisk) * 100) });

    return {
      capitalPrestado: Number(row.capital_prestado),
      totalEsperado: Number(row.total_esperado),
      totalCobrado: Number(row.total_cobrado),
      saldoPendiente: Number(row.saldo_pendiente),
      totalClientes: Number(row.total_clientes),
      prestamosPagados: Number(row.prestamos_pagados),
      cobradores: Number(row.cobradores),
      morosidad: riskRed,
      riskDistribution: {
        green: bucket(riskGreen),
        yellow: bucket(riskYellow),
        orange: bucket(riskOrange),
        red: bucket(riskRed),
      },
    };
  }

  private toPerformanceEntry(row: PerformanceRow): CollectorPerformanceEntry {
    return {
      id: row.collector_id,
      name: row.collector_name,
      dni: row.collector_dni,
      clientsCount: Number(row.clients_count),
      expectedToday: Number(row.expected_today),
      collectedToday: Number(row.collected_today),
      pendingToday: Number(row.pending_today),
      delayedCount: Number(row.delayed_count),
    };
  }

  private dashboardError(error: unknown): AppError {
    const message = this.errorMessage(error);

    if (message.includes('Active application profile required')) {
      return new AppError(
        'AUTH_UNAUTHORIZED',
        'Tu cuenta no está habilitada para operar todavía: completá el cambio de tu PIN o volvé a iniciar sesión. Si el problema sigue, contactá a un administrador.',
        error,
      );
    }

    if (message.includes('Only administrators or supervisors may view the dashboard')) {
      return new AppError('AUTH_UNAUTHORIZED', 'Solo un administrador o supervisor puede ver el dashboard.', error);
    }

    return this.toAppError(error, 'No se pudo cargar el dashboard.');
  }

  private toAppError(error: unknown, fallbackMessage: string): AppError {
    const code = this.errorCode(error);

    if (code === '42501') {
      return new AppError('AUTH_UNAUTHORIZED', 'No tenés permisos para realizar esta acción.', error);
    }

    return new AppError('SUPABASE_RPC', fallbackMessage, error);
  }

  private errorCode(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
      return error.code;
    }
    return '';
  }

  private errorMessage(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
      return error.message;
    }
    return '';
  }
}
