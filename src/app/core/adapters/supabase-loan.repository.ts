import { inject, Service } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';

import { calculateLoanPaymentSummary } from '../calculations/loan-payment-calculations';
import { AppError } from '../errors/app-error';
import {
  CreateLoanInput,
  Loan,
  LoanClientOption,
  LoanDetail,
  LoanInstallment,
  LoanInstallmentStatus,
  LoanListItem,
  RegisterLoanPaymentInput,
  RegisterLoanPaymentResult,
  RenewLoanInput,
  RenewLoanResult,
  UpdateLoanInput,
} from '../models/loan.model';
import { LoanRepository } from '../repositories/loan.repository';
import { Database } from '../supabase/database.types';
import { SUPABASE } from '../supabase/supabase-client';

type CreateLoanRow =
  Database['public']['Functions']['admin_create_loan']['Returns'][number];
type UpdateLoanRow =
  Database['public']['Functions']['admin_update_loan']['Returns'][number];
type RegisterPaymentRow =
  Database['public']['Functions']['register_payment']['Returns'][number];
type RenewLoanRow =
  Database['public']['Functions']['renew_loan']['Returns'][number];

@Service({ autoProvided: false })
export class SupabaseLoanRepository implements LoanRepository {
  private readonly supabase =
    inject(SUPABASE) as SupabaseClient<Database>;

  async list(): Promise<LoanListItem[]> {
    const loansQuery = this.supabase
      .from('loans')
      .select(`
        id,
        customer_id,
        principal_amount,
        interest_rate_percent,
        total_amount,
        installment_count,
        frequency,
        started_on,
        first_due_on,
        status,
        created_at,
        customer:customers!loans_customer_id_fkey (
          id,
          full_name,
          collector_id,
          collector:profiles!customers_collector_id_fkey (
            id,
            full_name
          )
        )
      `)
      .order('created_at', { ascending: false });

    const balancesQuery = this.supabase
      .from('installment_balances')
      .select(`
        loan_id,
        installment_number,
        due_date,
        scheduled_amount,
        outstanding_amount
      `);

    const paymentsQuery = this.supabase
      .from('payments')
      .select('loan_id, amount, status');

    const [
      { data: loans, error: loansError },
      { data: balances, error: balancesError },
      { data: payments, error: paymentsError },
    ] = await Promise.all([
      loansQuery,
      balancesQuery,
      paymentsQuery,
    ]);

    if (loansError) {
      throw this.toAppError(
        loansError,
        'No se pudo cargar la lista de préstamos.',
      );
    }

    if (balancesError) {
      throw this.toAppError(
        balancesError,
        'No se pudo calcular el saldo de los préstamos.',
      );
    }

    if (paymentsError) {
      throw this.toAppError(
        paymentsError,
        'No se pudo calcular el saldo real de los préstamos.',
      );
    }

    const scheduleSummaries = new Map<
      string,
      {
        installmentAmount: number | null;
        endDate: string | null;
      }
    >();

    for (const row of balances ?? []) {
      if (!row.loan_id) {
        continue;
      }

      const current = scheduleSummaries.get(row.loan_id) ?? {
        installmentAmount: null,
        endDate: null,
      };

      if (
        row.installment_number === 1 &&
        row.scheduled_amount !== null
      ) {
        current.installmentAmount =
          Number(row.scheduled_amount);
      }

      if (
        row.due_date &&
        (
          current.endDate === null ||
          row.due_date > current.endDate
        )
      ) {
        current.endDate = row.due_date;
      }

      scheduleSummaries.set(row.loan_id, current);
    }

    const paymentsByLoan = new Map<
      string,
      Array<{ amount: number; status: 'posted' | 'voided' }>
    >();

    for (const payment of payments ?? []) {
      const loanPayments = paymentsByLoan.get(payment.loan_id) ?? [];
      loanPayments.push({
        amount: Number(payment.amount),
        status: payment.status,
      });
      paymentsByLoan.set(payment.loan_id, loanPayments);
    }

    return (loans ?? []).map((row) => {
      const customer = row.customer;
      const collector = customer?.collector;

      if (!customer || !collector) {
        throw new AppError(
          'SUPABASE_RPC',
          'El préstamo tiene relaciones de cliente o cobrador incompletas.',
        );
      }

      const summary = scheduleSummaries.get(row.id);
      if (!summary || summary.installmentAmount === null || summary.endDate === null) {
        throw new AppError(
          'SUPABASE_RPC',
          'El préstamo no tiene un cronograma de cuotas válido.',
        );
      }

      return {
        id: row.id,

        clientId: customer.id,
        clientName: customer.full_name,

        collectorId: collector.id,
        collectorName: collector.full_name,

        principal: Number(row.principal_amount),
        interestRate:
          Number(row.interest_rate_percent),
        totalAmount: Number(row.total_amount),

        installmentAmount: summary.installmentAmount,
        installmentCount:
          Number(row.installment_count),

        frequency: row.frequency,

        balance: calculateLoanPaymentSummary(
          Number(row.total_amount),
          paymentsByLoan.get(row.id) ?? [],
        ).remainingBalance,

        status: row.status,

        startedOn: row.started_on,

        endDate: summary.endDate,

        createdAt: row.created_at,
      };
    });
  }

  // ==========================================================
  // AVAILABLE CLIENTS
  // ==========================================================

  async listAvailableClients(): Promise<
    LoanClientOption[]
  > {
    const { data, error } = await this.supabase
      .from('customers')
      .select(`
        id,
        document_number,
        full_name,
        collector_id,
        collector:profiles!customers_collector_id_fkey (
          id,
          full_name
        ),
        loans (
          id,
          status
        )
      `)
      .eq('active', true)
      .eq('loans.status', 'active')
      .order('full_name', { ascending: true });

    if (error) {
      throw this.toAppError(
        error,
        'No se pudo cargar la lista de clientes disponibles.',
      );
    }

    const clients: LoanClientOption[] = [];

    for (const row of data ?? []) {
      // La relación es LEFT JOIN por defecto.
      // Si no existe préstamo ACTIVE, loans será [].
      if ((row.loans ?? []).length > 0) {
        continue;
      }

      if (!row.collector) {
        continue;
      }

      clients.push({
        id: row.id,
        dni: row.document_number,
        fullName: row.full_name,

        collectorId: row.collector.id,
        collectorName: row.collector.full_name,
      });
    }

    return clients;
  }

  // ==========================================================
  // SCHEDULE
  // ==========================================================

  async getSchedule(
    loanId: string,
  ): Promise<LoanInstallment[]> {
    const { data, error } = await this.supabase
      .from('installment_balances')
      .select(`
        id,
        loan_id,
        installment_number,
        due_date,
        scheduled_amount,
        paid_amount,
        outstanding_amount,
        status,
        overdue_days
      `)
      .eq('loan_id', loanId)
      .order('installment_number', { ascending: true });

    if (error) {
      throw this.toAppError(
        error,
        'No se pudo cargar el cronograma de pagos.',
      );
    }

    return (data ?? []).map((row) => {
      if (
        row.id === null ||
        row.loan_id === null ||
        row.installment_number === null ||
        row.due_date === null ||
        row.scheduled_amount === null ||
        row.paid_amount === null ||
        row.outstanding_amount === null ||
        row.status === null ||
        row.overdue_days === null
      ) {
        throw new AppError(
          'SUPABASE_RPC',
          'El cronograma de pagos contiene datos incompletos.',
        );
      }

      const paidAmount = Number(row.paid_amount);
      const outstandingAmount = Number(row.outstanding_amount);

      return {
        id: row.id,
        loanId: row.loan_id,
        installmentNumber: Number(row.installment_number),
        dueDate: row.due_date,
        scheduledAmount: Number(row.scheduled_amount),
        paidAmount,
        outstandingAmount,
        status: this.installmentStatus(
          row.status,
          paidAmount,
          outstandingAmount,
        ),
        overdueDays: Number(row.overdue_days),
      };
    });
  }

  async getDetail(loanId: string): Promise<LoanDetail> {
    const loanRequest = this.supabase
      .from('loans')
      .select(`
        id,
        customer_id,
        principal_amount,
        interest_rate_percent,
        total_amount,
        installment_count,
        frequency,
        started_on,
        status,
        created_at,
        customer:customers!loans_customer_id_fkey (
          id,
          document_number,
          full_name,
          phone,
          address,
          notes,
          collector_id,
          collector:profiles!customers_collector_id_fkey (
            id,
            full_name
          )
        )
      `)
      .eq('id', loanId)
      .single();

    const paymentsRequest = this.supabase
      .from('payments')
      .select(`
        id,
        amount,
        payment_method,
        paid_at,
        business_date,
        status,
        notes,
        collector_id,
        void_reason,
        collector:profiles!payments_collector_id_fkey (
          id,
          full_name
        )
      `)
      .eq('loan_id', loanId)
      .order('paid_at', { ascending: false });

    const [loanResult, installments, paymentsResult] = await Promise.all([
      loanRequest,
      this.getSchedule(loanId),
      paymentsRequest,
    ]);

    if (loanResult.error || !loanResult.data) {
      throw this.toAppError(
        loanResult.error,
        'No se pudo cargar el detalle del préstamo.',
      );
    }

    if (paymentsResult.error) {
      throw this.toAppError(
        paymentsResult.error,
        'No se pudo cargar el historial de pagos.',
      );
    }

    if (installments.length === 0) {
      throw new AppError(
        'SUPABASE_RPC',
        'El préstamo no tiene un cronograma activo.',
      );
    }

    const row = loanResult.data;
    const customer = row.customer;
    const collector = customer?.collector;

    if (!customer || !collector) {
      throw new AppError(
        'SUPABASE_RPC',
        'El préstamo tiene datos incompletos del cliente o cobrador.',
      );
    }

    const payments = (paymentsResult.data ?? []).map((payment) => {
      if (!payment.collector) {
        throw new AppError(
          'SUPABASE_RPC',
          'Un pago tiene datos incompletos del cobrador.',
        );
      }

      return {
        id: payment.id,
        amount: Number(payment.amount),
        paymentMethod: payment.payment_method,
        paidAt: payment.paid_at,
        businessDate: payment.business_date,
        status: payment.status,
        notes: payment.notes,
        collectorId: payment.collector_id,
        collectorName: payment.collector.full_name,
        voidReason: payment.void_reason,
      };
    });
    const balance = calculateLoanPaymentSummary(
      Number(row.total_amount),
      payments,
    ).remainingBalance;

    return {
      loan: {
        id: row.id,
        clientId: customer.id,
        clientName: customer.full_name,
        collectorId: collector.id,
        collectorName: collector.full_name,
        principal: Number(row.principal_amount),
        interestRate: Number(row.interest_rate_percent),
        totalAmount: Number(row.total_amount),
        installmentAmount: installments[0].scheduledAmount,
        installmentCount: Number(row.installment_count),
        frequency: row.frequency,
        balance,
        status: row.status,
        startedOn: row.started_on,
        endDate: installments.at(-1)?.dueDate ?? row.started_on,
        createdAt: row.created_at,
      },
      client: {
        id: customer.id,
        dni: customer.document_number,
        fullName: customer.full_name,
        phone: customer.phone,
        address: customer.address,
        notes: customer.notes,
        collectorId: collector.id,
        collectorName: collector.full_name,
      },
      installments,
      payments,
    };
  }

  // ==========================================================
  // CREATE
  // ==========================================================

  async create(
    input: CreateLoanInput,
  ): Promise<Loan> {
    const { data, error } =
      await this.supabase.rpc(
        'admin_create_loan',
        {
          p_customer_id: input.clientId,
          p_principal: input.principal,
          p_interest_rate:
            input.interestRate,
          p_frequency: input.frequency,
          p_installment_count:
            input.installmentCount,
          p_started_on: input.startedOn,
          p_first_due_on: input.firstDueOn,
        },
      );

    if (error) {
      throw this.createLoanError(error);
    }

    const row = data?.[0];

    if (!row) {
      throw new AppError(
        'SUPABASE_RPC',
        'La creación no devolvió el préstamo registrado.',
      );
    }

    return this.toLoan(row);
  }

  // ==========================================================
  // UPDATE
  // ==========================================================

  async update(
    input: UpdateLoanInput,
  ): Promise<Loan> {
    const { data, error } = await this.supabase.rpc(
      'admin_update_loan',
      {
        p_loan_id: input.loanId,
        p_principal: input.principal,
        p_interest_rate: input.interestRate,
        p_frequency: input.frequency,
        p_installment_count: input.installmentCount,
        p_started_on: input.startedOn,
        p_reason: input.reason,
      },
    );

    if (error) {
      throw this.updateLoanError(error);
    }

    const row = data?.[0];

    if (!row) {
      throw new AppError(
        'SUPABASE_RPC',
        'La edición no devolvió el préstamo actualizado.',
      );
    }

    return this.toLoan(row);
  }

  async registerPayment(
    input: RegisterLoanPaymentInput,
  ): Promise<RegisterLoanPaymentResult> {
    const { data, error } = await this.supabase.rpc(
      'register_payment',
      {
        p_loan_id: input.loanId,
        p_amount: input.amount,
        p_payment_method: input.paymentMethod,
        p_notes: input.notes.trim() || undefined,
      },
    );

    if (error) {
      throw this.registerPaymentError(error);
    }

    const row: RegisterPaymentRow | undefined = data?.[0];
    if (!row) {
      throw new AppError(
        'SUPABASE_RPC',
        'El registro no devolvió la confirmación del pago.',
      );
    }

    return {
      paymentId: row.payment_id,
      allocatedAmount: Number(row.allocated_amount),
      remainingBalance: Number(row.remaining_balance),
      resultingLoanStatus: row.resulting_loan_status,
    };
  }

  async renew(input: RenewLoanInput): Promise<RenewLoanResult> {
    const { data, error } = await this.supabase.rpc('renew_loan', {
      p_loan_id: input.loanId,
      p_principal: input.principal,
      p_interest_rate: input.interestRate,
      p_frequency: input.frequency,
      p_installment_count: input.installmentCount,
      p_started_on: input.startedOn,
    });

    if (error) {
      throw this.renewLoanError(error);
    }

    const row: RenewLoanRow | undefined = data?.[0];
    if (!row) {
      throw new AppError('SUPABASE_RPC', 'La renovación no devolvió el préstamo registrado.');
    }

    return {
      loanId: row.loan_id,
      clientId: row.customer_id,
      previousLoanId: row.previous_loan_id,
      totalAmount: Number(row.total_amount),
      disbursedAmount: Number(row.disbursed_amount),
      baseInstallmentAmount: Number(row.base_installment_amount),
      lastInstallmentAmount: Number(row.last_installment_amount),
      firstDueOn: row.first_due_on,
    };
  }

  // ==========================================================
  // MAPPERS
  // ==========================================================

  private toLoan(
    row: CreateLoanRow | UpdateLoanRow,
  ): Loan {
    return {
      id: row.id,
      clientId: row.customer_id,

      principal:
        Number(row.principal_amount),

      interestRate:
        Number(row.interest_rate_percent),

      totalAmount:
        Number(row.total_amount),

      disbursedAmount:
        Number(row.disbursed_amount),

      installmentCount:
        Number(row.installment_count),

      frequency: row.frequency,

      startedOn: row.started_on,
      firstDueOn: row.first_due_on,

      status: row.status,

      createdAt: row.created_at,
    };
  }

  // ==========================================================
  // ERRORS
  // ==========================================================

  private installmentStatus(
    status: string,
    paidAmount: number,
    outstandingAmount: number,
  ): LoanInstallmentStatus {
    if (paidAmount > 0 && outstandingAmount > 0) {
      return 'partial';
    }

    if (
      status === 'pending' ||
      status === 'overdue' ||
      status === 'paid'
    ) {
      return status;
    }

    throw new AppError(
      'SUPABASE_RPC',
      'El cronograma de pagos contiene un estado desconocido.',
    );
  }

  private createLoanError(
    error: unknown,
  ): AppError {
    const message =
      this.errorMessage(error);

    if (
      message.includes(
        'Customer already has an active loan',
      )
    ) {
      return new AppError(
        'VALIDATION',
        'El cliente ya tiene un préstamo activo.',
        error,
      );
    }

    if (
      message.includes(
        'Cannot create a loan for an inactive customer',
      )
    ) {
      return new AppError(
        'VALIDATION',
        'No se puede crear un préstamo para un cliente inactivo.',
        error,
      );
    }

    if (
      message.includes(
        'Only administrators may create loans',
      )
    ) {
      return new AppError(
        'AUTH_UNAUTHORIZED',
        'Solo un administrador puede crear préstamos.',
        error,
      );
    }

    return this.toAppError(
      error,
      'No se pudo crear el préstamo.',
    );
  }

  private updateLoanError(
    error: unknown,
  ): AppError {
    const message = this.errorMessage(error);

    if (message.includes('Only active loans may be updated')) {
      return new AppError(
        'VALIDATION',
        'Solo se pueden editar préstamos activos.',
        error,
      );
    }

    if (message.includes('Loans with payment history cannot be updated')) {
      return new AppError(
        'VALIDATION',
        'No se puede editar un préstamo con historial de pagos.',
        error,
      );
    }

    if (message.includes('Principal cannot change after its cash closure exists')) {
      return new AppError(
        'VALIDATION',
        'No se puede cambiar el capital porque el desembolso ya forma parte de un cierre de caja.',
        error,
      );
    }

    if (
      message.includes('Loan active schedule is inconsistent') ||
      message.includes('Loan disbursement cash movement is inconsistent')
    ) {
      return new AppError(
        'VALIDATION',
        'No se puede editar el préstamo porque sus datos financieros son inconsistentes.',
        error,
      );
    }

    if (message.includes('Only administrators may update loans')) {
      return new AppError(
        'AUTH_UNAUTHORIZED',
        'Solo un administrador puede editar préstamos.',
        error,
      );
    }

    return this.toAppError(
      error,
      'No se pudo editar el préstamo.',
    );
  }

  private registerPaymentError(error: unknown): AppError {
    const message = this.errorMessage(error);

    if (message.includes('Payment exceeds outstanding loan balance')) {
      return new AppError(
        'VALIDATION',
        'El monto no puede superar el saldo pendiente.',
        error,
      );
    }

    if (message.includes('Payments can only be registered on active loans')) {
      return new AppError(
        'VALIDATION',
        'Solo se pueden registrar pagos en préstamos activos.',
        error,
      );
    }

    if (message.includes('Loan has no outstanding balance')) {
      return new AppError(
        'VALIDATION',
        'El préstamo no tiene saldo pendiente.',
        error,
      );
    }

    if (
      message.includes('Payment amount must be greater than zero') ||
      message.includes('Payment amount may contain at most two decimals')
    ) {
      return new AppError(
        'VALIDATION',
        'Ingresa un monto válido con máximo dos decimales.',
        error,
      );
    }

    if (message.includes('Insufficient privileges')) {
      return new AppError(
        'AUTH_UNAUTHORIZED',
        'No tenés permisos para registrar este pago.',
        error,
      );
    }

    return this.toAppError(error, 'No se pudo registrar el pago.');
  }

  private renewLoanError(error: unknown): AppError {
    const message = this.errorMessage(error);

    if (message.includes('Blacklisted customers cannot renew their loan')) {
      return new AppError(
        'VALIDATION',
        'El cliente es moroso (más de 5 días de atraso) y no puede renovar su préstamo.',
        error,
      );
    }

    if (message.includes('Only active or fully paid loans can be renewed')) {
      return new AppError(
        'VALIDATION',
        'Solo se pueden renovar préstamos activos o totalmente pagados.',
        error,
      );
    }

    if (message.includes('Principal must be at least the outstanding balance of the previous loan')) {
      return new AppError(
        'VALIDATION',
        'El nuevo capital debe ser al menos igual al saldo pendiente del préstamo anterior.',
        error,
      );
    }

    if (message.includes('Cannot renew a loan for an inactive customer')) {
      return new AppError(
        'VALIDATION',
        'No se puede renovar el préstamo de un cliente inactivo.',
        error,
      );
    }

    if (
      message.includes('Collector cannot renew loans for another portfolio') ||
      message.includes('Insufficient privileges')
    ) {
      return new AppError(
        'AUTH_UNAUTHORIZED',
        'No tenés permisos para renovar este préstamo.',
        error,
      );
    }

    if (message.includes('Loan not found') || message.includes('Customer not found')) {
      return new AppError('VALIDATION', 'No se encontró el préstamo o el cliente.', error);
    }

    if (
      message.includes('Principal must be greater than zero') ||
      message.includes('Principal may contain at most two decimals') ||
      message.includes('Interest rate cannot be negative') ||
      message.includes('Interest rate may contain at most four decimals') ||
      message.includes('Invalid installment count') ||
      message.includes('Loan start date is required') ||
      message.includes('Installment amounts must be greater than zero')
    ) {
      return new AppError('VALIDATION', 'Revisá los datos ingresados para la renovación.', error);
    }

    return this.toAppError(error, 'No se pudo renovar el préstamo.');
  }

  private toAppError(
    error: unknown,
    fallbackMessage: string,
  ): AppError {
    const code = this.errorCode(error);

    if (code === '42501') {
      return new AppError(
        'AUTH_UNAUTHORIZED',
        'No tenés permisos para realizar esta acción.',
        error,
      );
    }

    if (code === '22023' || code === '23505') {
      return new AppError(
        'VALIDATION',
        this.errorMessage(error) || fallbackMessage,
        error,
      );
    }

    return new AppError(
      'SUPABASE_RPC',
      fallbackMessage,
      error,
    );
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

  private errorMessage(
    error: unknown,
  ): string {
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
