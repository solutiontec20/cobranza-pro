import { inject, Service } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../errors/app-error';
import {
  DailyControlCollectorOption,
  DailyControlFilters,
  DailyControlReport,
  DailyControlRow,
  DailyControlStatus,
  DailyControlSummary,
} from '../models/daily-control.model';
import { DailyControlRepository } from '../repositories/daily-control.repository';
import { Database } from '../supabase/database.types';
import { SUPABASE } from '../supabase/supabase-client';

type ReportRow = Database['public']['Functions']['admin_daily_control_report']['Returns'][number];

@Service({ autoProvided: false })
export class SupabaseDailyControlRepository implements DailyControlRepository {
  private readonly supabase = inject(SUPABASE) as SupabaseClient<Database>;

  async listCollectors(): Promise<DailyControlCollectorOption[]> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'collector')
      .eq('active', true)
      .order('full_name', { ascending: true });

    if (error) {
      throw this.toAppError(error, 'No se pudo cargar la lista de cobradores.');
    }

    return (data ?? []).map((row) => ({ id: row.id, fullName: row.full_name }));
  }

  async getReport(filters: DailyControlFilters): Promise<DailyControlReport> {
    const { data, error } = await this.supabase.rpc('admin_daily_control_report', {
      p_business_date: filters.businessDate,
      p_collector_id: filters.collectorId ?? undefined,
    });

    if (error) {
      throw this.reportError(error);
    }

    const rows = (data ?? [])
      .map((row) => this.toRow(row))
      .filter((row) => filters.status === 'all' || row.status === filters.status)
      .sort((left, right) => {
        if (left.status === 'overdue' && right.status !== 'overdue') return -1;
        if (left.status !== 'overdue' && right.status === 'overdue') return 1;
        return right.overdueDays - left.overdueDays || left.clientName.localeCompare(right.clientName, 'es-PE');
      });

    return {
      filters: { ...filters },
      rows,
      summary: this.summarize(rows),
      generatedAt: new Date().toISOString(),
    };
  }

  private toRow(row: ReportRow): DailyControlRow {
    const balanceAsOf = Number(row.balance_as_of);
    const overdueDays = Number(row.overdue_days);

    return {
      loanId: row.loan_id,
      clientId: row.customer_id,
      clientDni: row.client_dni,
      clientName: row.client_name,
      collectorId: row.collector_id,
      collectorName: row.collector_name,
      principalAmount: Number(row.principal_amount),
      totalAmount: Number(row.total_amount),
      startedOn: row.started_on,
      endDate: row.end_date,
      installmentAmount: Number(row.installment_amount),
      scheduledOnDate: Number(row.scheduled_on_date),
      collectedOnDate: Number(row.collected_on_date),
      paidToDate: Number(row.paid_to_date),
      balanceAsOf,
      oldestUnpaidDueDate: row.oldest_unpaid_due_date,
      overdueDays,
      status: this.statusFor(balanceAsOf, overdueDays),
    };
  }

  private statusFor(balanceAsOf: number, overdueDays: number): DailyControlStatus {
    if (balanceAsOf === 0) return 'paid';
    return overdueDays > 0 ? 'overdue' : 'on_track';
  }

  private summarize(rows: DailyControlRow[]): DailyControlSummary {
    const scheduledAmount = this.roundMoney(rows.reduce((total, row) => total + row.scheduledOnDate, 0));
    const collectedAmount = this.roundMoney(rows.reduce((total, row) => total + row.collectedOnDate, 0));

    return {
      scheduledAmount,
      collectedAmount,
      operationalDifference: this.roundMoney(scheduledAmount - collectedAmount),
      attendedClients: rows.filter((row) => row.collectedOnDate > 0).length,
      overdueClients: rows.filter((row) => row.status === 'overdue').length,
    };
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private reportError(error: unknown): AppError {
    const message = this.errorMessage(error);

    if (message.includes('Active application profile required')) {
      return new AppError(
        'AUTH_UNAUTHORIZED',
        'Tu cuenta no está habilitada para operar todavía: completá el cambio de tu PIN o volvé a iniciar sesión. Si el problema sigue, contactá a un administrador.',
        error,
      );
    }

    if (message.includes('Only administrators or supervisors may view the daily control report')) {
      return new AppError('AUTH_UNAUTHORIZED', 'Solo un administrador o supervisor puede ver el control diario.', error);
    }

    if (message.includes('Business date is required')) {
      return new AppError('VALIDATION', 'Seleccioná una fecha de corte.', error);
    }

    return this.toAppError(error, 'No se pudo cargar el control diario.');
  }

  private toAppError(error: unknown, fallbackMessage: string): AppError {
    const code = this.errorCode(error);

    if (code === '42501') {
      return new AppError('AUTH_UNAUTHORIZED', 'No tenés permisos para realizar esta acción.', error);
    }

    if (code === '22023') {
      return new AppError('VALIDATION', this.errorMessage(error) || fallbackMessage, error);
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
