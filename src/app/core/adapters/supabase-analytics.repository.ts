import { inject, Service } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../errors/app-error';
import {
  AnalyticsCollectorEntry,
  AnalyticsCollectorOption,
  AnalyticsExpenseCategoryEntry,
  AnalyticsFinancialPoint,
  AnalyticsQuery,
} from '../models/analytics.model';
import { AnalyticsRepository } from '../repositories/analytics.repository';
import { Database } from '../supabase/database.types';
import { SUPABASE } from '../supabase/supabase-client';

type SeriesRow = Database['public']['Functions']['admin_analytics_series']['Returns'][number];
type CollectorRow =
  Database['public']['Functions']['admin_analytics_collectors']['Returns'][number];
type CategoryRow =
  Database['public']['Functions']['admin_analytics_expense_categories']['Returns'][number];

const FALLBACK_MESSAGE = 'No se pudo cargar la información de analíticas.';

@Service({ autoProvided: false })
export class SupabaseAnalyticsRepository implements AnalyticsRepository {
  private readonly supabase = inject(SUPABASE) as SupabaseClient<Database>;

  async listCollectors(): Promise<AnalyticsCollectorOption[]> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'collector')
      .eq('active', true)
      .order('full_name', { ascending: true });

    if (error) throw this.toAppError(error, 'No se pudo cargar la lista de cobradores.');

    return (data ?? []).map((row) => ({ id: row.id, fullName: row.full_name }));
  }

  async getSeries(
    query: AnalyticsQuery,
    abortSignal?: AbortSignal,
  ): Promise<AnalyticsFinancialPoint[]> {
    let request = this.supabase.rpc('admin_analytics_series', {
      p_start: query.start,
      p_end: query.end,
      p_bucket: query.bucket,
      p_collector_id: query.collectorId ?? undefined,
    });
    if (abortSignal) request = request.abortSignal(abortSignal);

    const { data, error } = await request;
    if (error) throw this.toAppError(error, FALLBACK_MESSAGE);

    return (data ?? []).map((row) => this.toPoint(row));
  }

  async getCollectorPerformance(
    query: AnalyticsQuery,
    abortSignal?: AbortSignal,
  ): Promise<AnalyticsCollectorEntry[]> {
    let request = this.supabase.rpc('admin_analytics_collectors', {
      p_start: query.start,
      p_end: query.end,
    });
    if (abortSignal) request = request.abortSignal(abortSignal);

    const { data, error } = await request;
    if (error) throw this.toAppError(error, FALLBACK_MESSAGE);

    return (data ?? []).map((row) => this.toCollector(row));
  }

  async getExpenseCategories(
    query: AnalyticsQuery,
    abortSignal?: AbortSignal,
  ): Promise<AnalyticsExpenseCategoryEntry[]> {
    let request = this.supabase.rpc('admin_analytics_expense_categories', {
      p_start: query.start,
      p_end: query.end,
      p_collector_id: query.collectorId ?? undefined,
    });
    if (abortSignal) request = request.abortSignal(abortSignal);

    const { data, error } = await request;
    if (error) throw this.toAppError(error, FALLBACK_MESSAGE);

    return (data ?? []).map((row) => this.toCategory(row));
  }

  private toPoint(row: SeriesRow): AnalyticsFinancialPoint {
    return {
      bucketStart: row.bucket_start,
      bucketEnd: row.bucket_end,
      collectedAmount: Number(row.collected_amount),
      interestCollected: Number(row.interest_collected),
      loanDisbursements: Number(row.loan_disbursements),
      operatingExpenses: Number(row.operating_expenses),
      netProfit: Number(row.net_profit),
      paymentsCount: Number(row.payments_count),
    };
  }

  private toCollector(row: CollectorRow): AnalyticsCollectorEntry {
    return {
      collectorId: row.collector_id,
      name: row.collector_name,
      dni: row.collector_dni,
      collectedAmount: Number(row.collected_amount),
      interestCollected: Number(row.interest_collected),
      paymentsCount: Number(row.payments_count),
      clientsAttended: Number(row.clients_attended),
      loanDisbursements: Number(row.loan_disbursements),
      operatingExpenses: Number(row.operating_expenses),
      netProfit: Number(row.net_profit),
    };
  }

  private toCategory(row: CategoryRow): AnalyticsExpenseCategoryEntry {
    return {
      category: row.category,
      expenseCount: Number(row.expense_count),
      spentAmount: Number(row.spent_amount),
    };
  }

  private toAppError(error: unknown, fallbackMessage: string): AppError {
    const message = this.errorMessage(error);

    if (message.includes('Active application profile required')) {
      return new AppError(
        'AUTH_UNAUTHORIZED',
        'Tu cuenta no está habilitada para operar todavía: completá el cambio de tu PIN o volvé a iniciar sesión. Si el problema sigue, contactá a un administrador.',
        error,
      );
    }

    if (message.includes('Only administrators or supervisors may view')) {
      return new AppError(
        'AUTH_UNAUTHORIZED',
        'Solo un administrador o supervisor puede ver las analíticas.',
        error,
      );
    }

    if (message.includes('End date must not precede start date')) {
      return new AppError(
        'VALIDATION',
        'La fecha final no puede ser anterior a la inicial.',
        error,
      );
    }

    if (message.includes('Date range is too large')) {
      return new AppError('VALIDATION', 'El rango de fechas no puede superar los 10 años.', error);
    }

    const code = this.errorCode(error);

    if (code === '42501') {
      return new AppError(
        'AUTH_UNAUTHORIZED',
        'No tenés permisos para realizar esta acción.',
        error,
      );
    }

    if (code === '22023') {
      return new AppError('VALIDATION', 'El período seleccionado no es válido.', error);
    }

    return new AppError('SUPABASE_RPC', fallbackMessage, error);
  }

  private errorCode(error: unknown): string {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
    ) {
      return error.code;
    }
    return '';
  }

  private errorMessage(error: unknown): string {
    if (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string'
    ) {
      return error.message;
    }
    return '';
  }
}
