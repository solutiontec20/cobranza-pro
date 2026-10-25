import { inject, Service } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../errors/app-error';
import {
  CashClosure,
  CashCollectorOption,
  CashDayBreakdown,
  CashExpense,
  CollectorCashDay,
  RegisterCashAllowanceInput,
  RegisterCashOpeningInput,
  RequestCashExpenseInput,
  ReviewCashExpenseInput,
  SubmitCashClosureInput,
  ValidateCashClosureInput,
} from '../models/cash-closure.model';
import { emptyCashDayBreakdown } from '../calculations/cash-closure-calculations';
import { CashClosureRepository } from '../repositories/cash-closure.repository';
import { Database } from '../supabase/database.types';
import { SUPABASE } from '../supabase/supabase-client';

type BreakdownRow = Database['public']['Views']['collector_cash_day_breakdown']['Row'];
type ClosureRow = Database['public']['Tables']['cash_closures']['Row'];
type ExpenseRow = Database['public']['Tables']['cash_expenses']['Row'];

@Service({ autoProvided: false })
export class SupabaseCashClosureRepository implements CashClosureRepository {
  private readonly supabase = inject(SUPABASE) as SupabaseClient<Database>;

  async listActiveCollectors(): Promise<CashCollectorOption[]> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'collector')
      .eq('active', true)
      .order('full_name', { ascending: true });

    if (error) {
      throw this.toAppError(error, 'No se pudo cargar la lista de cobradores activos.');
    }

    return (data ?? []).map((row) => ({ id: row.id, fullName: row.full_name }));
  }

  async getOwnDay(businessDate: string): Promise<CollectorCashDay> {
    const { data: userData, error: userError } = await this.supabase.auth.getUser();

    if (userError || !userData.user) {
      throw new AppError('AUTH_SESSION_EXPIRED', 'La sesión expiró. Volvé a iniciar sesión.', userError);
    }

    const collectorId = userData.user.id;
    const days = await this.fetchDays(businessDate, collectorId);
    return days[0] ?? this.emptyDay(collectorId, '', businessDate);
  }

  async listDay(businessDate: string): Promise<CollectorCashDay[]> {
    const collectors = await this.listActiveCollectors();
    const days = await this.fetchDays(businessDate);
    const byCollector = new Map(days.map((day) => [day.collectorId, day]));

    return collectors.map((collector) => {
      const day = byCollector.get(collector.id);
      return day
        ? { ...day, collectorName: collector.fullName }
        : this.emptyDay(collector.id, collector.fullName, businessDate);
    });
  }

  async registerOpening(input: RegisterCashOpeningInput): Promise<void> {
    const { error } = await this.supabase.rpc('register_cash_opening', {
      p_collector_id: input.collectorId,
      p_business_date: input.businessDate,
      p_amount: input.amount,
      p_notes: input.notes.trim() || undefined,
    });

    if (error) {
      throw this.openingError(error);
    }
  }

  async registerAllowance(input: RegisterCashAllowanceInput): Promise<void> {
    const { error } = await this.supabase.rpc('register_cash_allowance', {
      p_collector_id: input.collectorId,
      p_business_date: input.businessDate,
      p_amount: input.amount,
      p_notes: input.notes.trim() || undefined,
    });

    if (error) {
      throw this.allowanceError(error);
    }
  }

  async requestExpense(input: RequestCashExpenseInput): Promise<CashExpense> {
    const { data, error } = await this.supabase.rpc('request_cash_expense', {
      p_business_date: input.businessDate,
      p_category: input.category,
      p_amount: input.amount,
      p_description: input.description.trim() || undefined,
      p_collector_id: input.collectorId,
    });

    if (error) {
      throw this.expenseError(error);
    }

    const row = data?.[0];
    if (!row) {
      throw new AppError('SUPABASE_RPC', 'La solicitud no devolvió el gasto registrado.');
    }

    return {
      id: row.expense_id,
      collectorId: row.collector_id,
      businessDate: row.business_date,
      category: row.category,
      amount: Number(row.amount),
      description: input.description.trim() || null,
      status: row.status,
      cashMovementId: null,
      requestedBy: '',
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null,
      createdAt: new Date().toISOString(),
    };
  }

  async reviewExpense(input: ReviewCashExpenseInput): Promise<void> {
    const { error } = await this.supabase.rpc('review_cash_expense', {
      p_expense_id: input.expenseId,
      p_approve: input.approve,
      p_reason: input.reason.trim() || undefined,
    });

    if (error) {
      throw this.reviewError(error);
    }
  }

  async submitClosure(input: SubmitCashClosureInput): Promise<CashClosure> {
    const { data: userData, error: userError } = await this.supabase.auth.getUser();

    if (userError || !userData.user) {
      throw new AppError('AUTH_SESSION_EXPIRED', 'La sesión expiró. Volvé a iniciar sesión.', userError);
    }

    const { data, error } = await this.supabase.rpc('submit_cash_closure', {
      p_business_date: input.businessDate,
      p_delivered_amount: input.deliveredAmount,
      p_observation: input.observation.trim() || undefined,
    });

    if (error) {
      throw this.submitError(error);
    }

    const row = data?.[0];
    if (!row) {
      throw new AppError('SUPABASE_RPC', 'El cierre no devolvió la confirmación esperada.');
    }

    return {
      id: row.closure_id,
      collectorId: userData.user.id,
      businessDate: input.businessDate,
      expectedAmount: Number(row.expected_amount),
      deliveredAmount: Number(row.delivered_amount),
      differenceAmount: Number(row.difference_amount),
      status: row.closure_status,
      observation: input.observation.trim() || null,
      submittedAt: new Date().toISOString(),
      validatedAt: null,
      validatedBy: null,
    };
  }

  async validateClosure(input: ValidateCashClosureInput): Promise<void> {
    const { error } = await this.supabase.rpc('validate_cash_closure', {
      p_closure_id: input.closureId,
      p_observation: input.observation.trim() || undefined,
    });

    if (error) {
      throw this.validateError(error);
    }
  }

  // ==========================================================
  // PRIVATE HELPERS
  // ==========================================================

  private async fetchDays(businessDate: string, collectorId?: string): Promise<CollectorCashDay[]> {
    let breakdownQuery = this.supabase
      .from('collector_cash_day_breakdown')
      .select('*')
      .eq('business_date', businessDate);
    let closuresQuery = this.supabase.from('cash_closures').select('*').eq('business_date', businessDate);
    let expensesQuery = this.supabase
      .from('cash_expenses')
      .select('*')
      .eq('business_date', businessDate)
      .order('created_at', { ascending: false });

    if (collectorId) {
      breakdownQuery = breakdownQuery.eq('collector_id', collectorId);
      closuresQuery = closuresQuery.eq('collector_id', collectorId);
      expensesQuery = expensesQuery.eq('collector_id', collectorId);
    }

    const [breakdownResult, closuresResult, expensesResult] = await Promise.all([
      breakdownQuery,
      closuresQuery,
      expensesQuery,
    ]);

    if (breakdownResult.error) {
      throw this.toAppError(breakdownResult.error, 'No se pudo cargar el resumen de caja.');
    }
    if (closuresResult.error) {
      throw this.toAppError(closuresResult.error, 'No se pudo cargar el cierre de caja.');
    }
    if (expensesResult.error) {
      throw this.toAppError(expensesResult.error, 'No se pudo cargar los gastos operativos.');
    }

    const closureByCollector = new Map(
      (closuresResult.data ?? []).map((row) => [row.collector_id, this.toClosure(row)]),
    );
    const expensesByCollector = new Map<string, CashExpense[]>();
    for (const row of expensesResult.data ?? []) {
      const list = expensesByCollector.get(row.collector_id) ?? [];
      list.push(this.toExpense(row));
      expensesByCollector.set(row.collector_id, list);
    }

    return (breakdownResult.data ?? [])
      .filter((row): row is BreakdownRow & { collector_id: string; business_date: string } =>
        row.collector_id !== null && row.business_date !== null,
      )
      .map((row) => ({
        collectorId: row.collector_id,
        collectorName: '',
        businessDate: row.business_date,
        breakdown: this.toBreakdown(row),
        closure: closureByCollector.get(row.collector_id) ?? null,
        expenses: expensesByCollector.get(row.collector_id) ?? [],
      }));
  }

  private emptyDay(collectorId: string, collectorName: string, businessDate: string): CollectorCashDay {
    return {
      collectorId,
      collectorName,
      businessDate,
      breakdown: emptyCashDayBreakdown(collectorId, businessDate),
      closure: null,
      expenses: [],
    };
  }

  private toBreakdown(row: BreakdownRow): CashDayBreakdown {
    return {
      collectorId: row.collector_id ?? '',
      businessDate: row.business_date ?? '',
      openingAmount: Number(row.opening_amount ?? 0),
      allowanceAmount: Number(row.allowance_amount ?? 0),
      cashCollectedAmount: Number(row.cash_collected_amount ?? 0),
      yapeCollectedAmount: Number(row.yape_collected_amount ?? 0),
      plinCollectedAmount: Number(row.plin_collected_amount ?? 0),
      transferCollectedAmount: Number(row.transfer_collected_amount ?? 0),
      voidedCashAmount: Number(row.voided_cash_amount ?? 0),
      loanDisbursementAmount: Number(row.loan_disbursement_amount ?? 0),
      operatingExpenseAmount: Number(row.operating_expense_amount ?? 0),
    };
  }

  private toClosure(row: ClosureRow): CashClosure {
    return {
      id: row.id,
      collectorId: row.collector_id,
      businessDate: row.business_date,
      expectedAmount: Number(row.expected_amount),
      deliveredAmount: Number(row.delivered_amount),
      differenceAmount: Number(row.difference_amount ?? 0),
      status: row.status,
      observation: row.observation,
      submittedAt: row.submitted_at,
      validatedAt: row.validated_at,
      validatedBy: row.validated_by,
    };
  }

  private toExpense(row: ExpenseRow): CashExpense {
    return {
      id: row.id,
      collectorId: row.collector_id,
      businessDate: row.business_date,
      category: row.category,
      amount: Number(row.amount),
      description: row.description,
      status: row.status,
      cashMovementId: row.cash_movement_id,
      requestedBy: row.requested_by,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      rejectionReason: row.rejection_reason,
      createdAt: row.created_at,
    };
  }

  // ==========================================================
  // ERRORS
  // ==========================================================

  private openingError(error: unknown): AppError {
    const message = this.errorMessage(error);

    const operationalError = this.operationalProfileError(message, error);
    if (operationalError) return operationalError;

    if (message.includes('Only administrators or supervisors may register an opening float')) {
      return new AppError('AUTH_UNAUTHORIZED', 'Solo un administrador o supervisor puede registrar la apertura.', error);
    }
    if (message.includes('Opening float has already been registered')) {
      return new AppError('VALIDATION', 'Ya se registró la apertura de este cobrador para esta fecha.', error);
    }
    if (message.includes('Opening float must be registered for an active collector')) {
      return new AppError('VALIDATION', 'Seleccioná un cobrador activo válido.', error);
    }
    if (message.includes('Opening float amount must be greater than zero')) {
      return new AppError('VALIDATION', 'El monto de apertura debe ser mayor que cero.', error);
    }
    if (message.includes('Future opening floats are not allowed')) {
      return new AppError('VALIDATION', 'No se puede registrar una apertura con fecha futura.', error);
    }
    if (message.includes('Cannot register cash movements once the cash closure has been validated')) {
      return new AppError('VALIDATION', 'No se puede modificar la caja: el cierre de ese día ya fue validado.', error);
    }

    return this.toAppError(error, 'No se pudo registrar la apertura.');
  }

  private allowanceError(error: unknown): AppError {
    const message = this.errorMessage(error);

    const operationalError = this.operationalProfileError(message, error);
    if (operationalError) return operationalError;

    if (message.includes('Only administrators or supervisors may register an allowance')) {
      return new AppError('AUTH_UNAUTHORIZED', 'Solo un administrador o supervisor puede registrar viáticos.', error);
    }
    if (message.includes('Allowance must be registered for an active collector')) {
      return new AppError('VALIDATION', 'Seleccioná un cobrador activo válido.', error);
    }
    if (message.includes('Allowance amount must be greater than zero')) {
      return new AppError('VALIDATION', 'El monto del viático debe ser mayor que cero.', error);
    }
    if (message.includes('Future allowances are not allowed')) {
      return new AppError('VALIDATION', 'No se puede registrar un viático con fecha futura.', error);
    }
    if (message.includes('Cannot register cash movements once the cash closure has been validated')) {
      return new AppError('VALIDATION', 'No se puede modificar la caja: el cierre de ese día ya fue validado.', error);
    }

    return this.toAppError(error, 'No se pudo registrar el viático.');
  }

  private expenseError(error: unknown): AppError {
    const message = this.errorMessage(error);

    const operationalError = this.operationalProfileError(message, error);
    if (operationalError) return operationalError;

    if (message.includes('Collector cannot request an expense for another portfolio')) {
      return new AppError('AUTH_UNAUTHORIZED', 'No podés registrar un gasto para otro cobrador.', error);
    }
    if (message.includes('Collector is required when an administrator requests an expense')) {
      return new AppError('VALIDATION', 'Seleccioná el cobrador para este gasto.', error);
    }
    if (message.includes('Expense must be requested for an active collector')) {
      return new AppError('VALIDATION', 'Seleccioná un cobrador activo válido.', error);
    }
    if (message.includes('Expense amount must be greater than zero')) {
      return new AppError('VALIDATION', 'El monto del gasto debe ser mayor que cero.', error);
    }
    if (message.includes('Future expenses are not allowed')) {
      return new AppError('VALIDATION', 'No se puede registrar un gasto con fecha futura.', error);
    }
    if (message.includes('Cannot request an expense once the cash closure has been validated')) {
      return new AppError('VALIDATION', 'No se puede registrar un gasto: el cierre de ese día ya fue validado.', error);
    }

    return this.toAppError(error, 'No se pudo registrar el gasto.');
  }

  private reviewError(error: unknown): AppError {
    const message = this.errorMessage(error);

    const operationalError = this.operationalProfileError(message, error);
    if (operationalError) return operationalError;

    if (message.includes('Only administrators or supervisors may review expenses')) {
      return new AppError('AUTH_UNAUTHORIZED', 'Solo un administrador o supervisor puede revisar gastos.', error);
    }
    if (message.includes('A rejection reason is required')) {
      return new AppError('VALIDATION', 'Ingresá el motivo del rechazo.', error);
    }
    if (message.includes('Only pending expenses may be reviewed')) {
      return new AppError('VALIDATION', 'Este gasto ya fue revisado.', error);
    }
    if (message.includes('Expense not found')) {
      return new AppError('VALIDATION', 'No se encontró el gasto.', error);
    }
    if (message.includes('Cannot review an expense once the cash closure has been validated')) {
      return new AppError('VALIDATION', 'No se puede revisar el gasto: el cierre de ese día ya fue validado.', error);
    }

    return this.toAppError(error, 'No se pudo revisar el gasto.');
  }

  private submitError(error: unknown): AppError {
    const message = this.errorMessage(error);

    const operationalError = this.operationalProfileError(message, error);
    if (operationalError) return operationalError;

    if (message.includes('Only collectors may submit their cash closure')) {
      return new AppError('AUTH_UNAUTHORIZED', 'Solo un cobrador puede enviar su propio cierre de caja.', error);
    }
    if (message.includes('Future cash closures are not allowed')) {
      return new AppError('VALIDATION', 'No se puede cerrar caja con fecha futura.', error);
    }
    if (message.includes('Delivered amount cannot be negative')) {
      return new AppError('VALIDATION', 'El monto entregado no puede ser negativo.', error);
    }
    if (message.includes('An observation is required when the delivered amount differs from the expected amount')) {
      return new AppError('VALIDATION', 'Ingresá una observación: el monto entregado no coincide con el esperado.', error);
    }
    if (message.includes('Validated cash closure cannot be resubmitted')) {
      return new AppError('VALIDATION', 'Este cierre ya fue validado y no se puede modificar.', error);
    }

    return this.toAppError(error, 'No se pudo enviar el cierre de caja.');
  }

  private validateError(error: unknown): AppError {
    const message = this.errorMessage(error);

    const operationalError = this.operationalProfileError(message, error);
    if (operationalError) return operationalError;

    if (message.includes('Only administrators or supervisors may validate cash closures')) {
      return new AppError('AUTH_UNAUTHORIZED', 'Solo un administrador o supervisor puede validar el cierre.', error);
    }
    if (message.includes('Cash closure not found')) {
      return new AppError('VALIDATION', 'No se encontró el cierre de caja.', error);
    }
    if (message.includes('Only submitted cash closures may be validated')) {
      return new AppError('VALIDATION', 'Solo se pueden validar cierres enviados por el cobrador.', error);
    }
    if (message.includes('An observation is required when the delivered amount differs from the expected amount')) {
      return new AppError('VALIDATION', 'Ingresá una observación: el monto entregado no coincide con el esperado.', error);
    }

    return this.toAppError(error, 'No se pudo validar el cierre de caja.');
  }

  /**
   * `private.current_app_role()` returns NULL (not an error) whenever the profile is inactive,
   * still has a pending PIN change, or the session predates the latest credential reset — every
   * cash-closure RPC now raises this exact message in that case (see
   * `supabase/migrations/20261025140000_cash_closure_operational_profile_guard.sql`) instead of
   * silently bypassing the check or falling back to the generic "sin permisos" message.
   */
  private operationalProfileError(message: string, error: unknown): AppError | null {
    if (!message.includes('Active application profile required')) return null;

    return new AppError(
      'AUTH_UNAUTHORIZED',
      'Tu cuenta no está habilitada para operar todavía: completá el cambio de tu PIN o volvé a iniciar sesión. Si el problema sigue, contactá a un administrador.',
      error,
    );
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
