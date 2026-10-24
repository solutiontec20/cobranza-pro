import { inject, Service } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../errors/app-error';
import {
  CollectorPortfolioEntry,
  CreateCollectorClientInput,
  CreateCollectorClientResult,
} from '../models/collector-portfolio.model';
import { CollectorPortfolioRepository } from '../repositories/collector-portfolio.repository';
import { Database } from '../supabase/database.types';
import { SUPABASE } from '../supabase/supabase-client';

type PortfolioRow = Database['public']['Functions']['collector_list_portfolio']['Returns'][number];
type CreateClientRow =
  Database['public']['Functions']['collector_create_customer_loan']['Returns'][number];

@Service({ autoProvided: false })
export class SupabaseCollectorPortfolioRepository implements CollectorPortfolioRepository {
  private readonly supabase = inject(SUPABASE) as SupabaseClient<Database>;

  async listPortfolio(businessDate: string): Promise<CollectorPortfolioEntry[]> {
    const { data, error } = await this.supabase.rpc('collector_list_portfolio', {
      p_business_date: businessDate,
    });

    if (error) {
      throw this.toAppError(error, 'No se pudo cargar tu cartera de clientes.');
    }

    return (data ?? []).map((row) => this.toEntry(row));
  }

  async createClient(input: CreateCollectorClientInput): Promise<CreateCollectorClientResult> {
    const { data, error } = await this.supabase.rpc('collector_create_customer_loan', {
      p_document_number: input.dni.trim(),
      p_full_name: input.fullName.trim(),
      p_phone: input.phone.trim(),
      p_address: input.address.trim(),
      p_notes: input.notes.trim(),
      p_principal: input.principal,
      p_interest_rate: input.interestRate,
      p_frequency: input.frequency,
      p_installment_count: input.installmentCount,
      p_started_on: input.startedOn,
    });

    if (error) {
      throw this.createClientError(error);
    }

    const row: CreateClientRow | undefined = data?.[0];
    if (!row) {
      throw new AppError('SUPABASE_RPC', 'La creación no devolvió el cliente registrado.');
    }

    return {
      customerId: row.customer_id,
      loanId: row.loan_id,
      totalAmount: Number(row.total_amount),
      baseInstallmentAmount: Number(row.base_installment_amount),
      lastInstallmentAmount: Number(row.last_installment_amount),
      firstDueOn: row.first_due_on,
    };
  }

  async findLatestLoanId(customerId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('loans')
      .select('id')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw this.toAppError(error, 'No se pudo cargar el préstamo del cliente.');
    }

    return data?.id ?? null;
  }

  // ==========================================================
  // MAPPERS
  // ==========================================================

  private toEntry(row: PortfolioRow): CollectorPortfolioEntry {
    // The RPC left-joins the active loan, so these columns come back as SQL NULL when the
    // customer has no active loan right now. The generated types don't express that nullability
    // for table-returning RPCs, so we read them defensively at runtime.
    const loanId = row.loan_id as string | null;
    const isLoanActive = loanId !== null;

    return {
      customerId: row.customer_id,
      dni: row.document_number,
      fullName: row.full_name,
      phone: row.phone ?? '',
      address: row.address ?? '',
      notes: row.notes ?? '',

      loanId,
      principal: Number(row.principal_amount ?? 0),
      interestRate: Number(row.interest_rate_percent ?? 0),
      totalAmount: Number(row.total_amount ?? 0),
      installmentCount: Number(row.installment_count ?? 0),
      frequency: isLoanActive ? row.frequency : null,
      startedOn: (row.started_on as string | null) ?? null,
      firstDueOn: (row.first_due_on as string | null) ?? null,
      isLoanActive,

      remainingBalance: Number(row.remaining_balance ?? 0),
      installmentAmount: Number(row.installment_amount ?? 0),
      todayScheduledAmount: Number(row.today_scheduled_amount ?? 0),
      todayOutstandingAmount: Number(row.today_outstanding_amount ?? 0),
      todayCollectedAmount: Number(row.today_collected_amount ?? 0),
      overdueDays: Number(row.overdue_days ?? 0),
    };
  }

  // ==========================================================
  // ERRORS
  // ==========================================================

  private createClientError(error: unknown): AppError {
    const message = this.errorMessage(error);

    if (message.includes('Only active collectors may create customers and loans')) {
      return new AppError(
        'AUTH_UNAUTHORIZED',
        'Solo un cobrador activo puede registrar clientes.',
        error,
      );
    }

    if (message.includes('Customer document must contain 8 to 12 digits')) {
      return new AppError('VALIDATION', 'El DNI debe contener entre 8 y 12 dígitos.', error);
    }

    if (message.includes('Invalid customer name')) {
      return new AppError('VALIDATION', 'Ingresá un nombre válido.', error);
    }

    if (message.includes('Customer phone must contain at most 15 digits')) {
      return new AppError('VALIDATION', 'El teléfono solo puede contener hasta 15 dígitos.', error);
    }

    if (message.includes('Customer address is required')) {
      return new AppError('VALIDATION', 'La dirección es obligatoria.', error);
    }

    if (message.includes('Customer notes may contain at most 500 characters')) {
      return new AppError(
        'VALIDATION',
        'Las observaciones no pueden superar 500 caracteres.',
        error,
      );
    }

    if (message.includes('Principal must be greater than zero')) {
      return new AppError('VALIDATION', 'El capital debe ser mayor que cero.', error);
    }

    if (message.includes('Principal may contain at most two decimals')) {
      return new AppError('VALIDATION', 'El capital puede tener máximo dos decimales.', error);
    }

    if (message.includes('Interest rate cannot be negative')) {
      return new AppError('VALIDATION', 'La tasa de interés no puede ser negativa.', error);
    }

    if (message.includes('Interest rate may contain at most four decimals')) {
      return new AppError('VALIDATION', 'La tasa de interés tiene demasiados decimales.', error);
    }

    if (message.includes('Loan frequency is required')) {
      return new AppError('VALIDATION', 'Seleccioná la frecuencia del préstamo.', error);
    }

    if (message.includes('Invalid installment count')) {
      return new AppError('VALIDATION', 'La cantidad de cuotas no es válida.', error);
    }

    if (message.includes('Loan start date is required')) {
      return new AppError('VALIDATION', 'Seleccioná la fecha de inicio.', error);
    }

    if (message.includes('Installment amounts must be greater than zero')) {
      return new AppError('VALIDATION', 'La cantidad de cuotas genera importes inválidos.', error);
    }

    if (this.errorCode(error) === '23505') {
      return new AppError('VALIDATION', 'Ya existe un cliente con ese DNI.', error);
    }

    return this.toAppError(error, 'No se pudo registrar el cliente.');
  }

  private toAppError(error: unknown, fallbackMessage: string): AppError {
    const code = this.errorCode(error);

    if (code === '42501') {
      return new AppError('AUTH_UNAUTHORIZED', 'No tenés permisos para realizar esta acción.', error);
    }

    if (code === '22023' || code === '23505') {
      return new AppError('VALIDATION', this.errorMessage(error) || fallbackMessage, error);
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
