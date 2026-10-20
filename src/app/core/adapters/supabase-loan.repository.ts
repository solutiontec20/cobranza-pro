import { inject, Service } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';

import { AppError } from '../errors/app-error';
import {
  CreateLoanInput,
  Loan,
  LoanClientOption,
  LoanListItem,
} from '../models/loan.model';
import { LoanRepository } from '../repositories/loan.repository';
import { Database } from '../supabase/database.types';
import { SUPABASE } from '../supabase/supabase-client';

type CreateLoanRow =
  Database['public']['Functions']['admin_create_loan']['Returns'][number];

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

    const [
      { data: loans, error: loansError },
      { data: balances, error: balancesError },
    ] = await Promise.all([
      loansQuery,
      balancesQuery,
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

    const summaries = new Map<
      string,
      {
        balance: number;
        installmentAmount: number | null;
        endDate: string | null;
      }
    >();

    for (const row of balances ?? []) {
      if (!row.loan_id) {
        continue;
      }

      const current = summaries.get(row.loan_id) ?? {
        balance: 0,
        installmentAmount: null,
        endDate: null,
      };

      current.balance += Number(
        row.outstanding_amount ?? 0,
      );

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

      summaries.set(row.loan_id, current);
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

      const summary = summaries.get(row.id);
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

        balance: summary.balance,

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
  // MAPPERS
  // ==========================================================

  private toLoan(
    row: CreateLoanRow,
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
