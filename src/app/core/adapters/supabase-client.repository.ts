import { inject, Service } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../errors/app-error';
import {
  Client,
  ClientCollectorOption,
  ClientListItem,
  CreateClientInput,
  UpdateClientInput,
} from '../models/client.model';
import { ClientRepository } from '../repositories/client.repository';
import { Database } from '../supabase/database.types';
import { SUPABASE } from '../supabase/supabase-client';

type CustomerRow = Database['public']['Tables']['customers']['Row'];

@Service({ autoProvided: false })
export class SupabaseClientRepository implements ClientRepository {
  private readonly supabase = inject(SUPABASE) as SupabaseClient<Database>;

  async list(): Promise<ClientListItem[]> {
    const [customersResult, financialStatusResult] = await Promise.all([
      this.supabase
        .from('customers')
        .select(`
          id,
          document_number,
          full_name,
          phone,
          address,
          notes,
          collector_id,
          active,
          created_at,
          collector:profiles!customers_collector_id_fkey (
            full_name
          )
        `)
        .order('created_at', { ascending: false }),
      this.supabase
        .from('customer_financial_status')
        .select('customer_id, max_overdue_days, is_blacklisted, outstanding_amount'),
    ]);

    if (customersResult.error) {
      throw this.toAppError(customersResult.error, 'No se pudo cargar la lista de clientes.');
    }

    if (financialStatusResult.error) {
      throw this.toAppError(
        financialStatusResult.error,
        'No se pudo cargar el estado financiero de los clientes.',
      );
    }

    const financialStatusByClient = new Map(
      (financialStatusResult.data ?? [])
        .filter((row) => row.customer_id !== null)
        .map((row) => [row.customer_id as string, row]),
    );

    return (customersResult.data ?? []).map((row) => {
      if (!row.collector) {
        throw new AppError(
          'SUPABASE_RPC',
          'El cliente tiene una asignación de cobrador incompleta.',
        );
      }

      const financialStatus = financialStatusByClient.get(row.id);

      return {
        id: row.id,
        dni: row.document_number,
        fullName: row.full_name,
        phone: row.phone ?? '',
        address: row.address ?? '',
        collectorId: row.collector_id,
        collectorName: row.collector.full_name,
        notes: row.notes ?? '',
        active: row.active,
        createdAt: row.created_at,
        outstandingAmount: Number(financialStatus?.outstanding_amount ?? 0),
        overdueDays: Number(financialStatus?.max_overdue_days ?? 0),
        isBlacklisted: financialStatus?.is_blacklisted ?? false,
      };
    });
  }

  async listActiveCollectors(): Promise<ClientCollectorOption[]> {
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

  async create(input: CreateClientInput): Promise<Client> {
    const { data: userData, error: userError } = await this.supabase.auth.getUser();

    if (userError || !userData.user) {
      throw new AppError(
        'AUTH_SESSION_EXPIRED',
        'La sesión expiró. Volvé a iniciar sesión.',
        userError,
      );
    }

    const { data, error } = await this.supabase
      .from('customers')
      .insert({
        document_number: input.dni.trim(),
        full_name: input.fullName.trim(),
        phone: input.phone.trim() || null,
        address: input.address.trim(),
        notes: input.notes.trim() || null,
        collector_id: input.collectorId,
        created_by: userData.user.id,
      })
      .select('*')
      .single();

    if (error) {
      throw this.createError(error);
    }

    return this.toClient(data);
  }

  async update(input: UpdateClientInput): Promise<Client> {
    const { data, error } = await this.supabase
      .from('customers')
      .update({
        document_number: input.dni.trim(),
        full_name: input.fullName.trim(),
        phone: input.phone.trim() || null,
        address: input.address.trim(),
        notes: input.notes.trim() || null,
        collector_id: input.collectorId,
        active: input.active,
      })
      .eq('id', input.id)
      .select('*')
      .single();

    if (error) {
      throw this.mutationError(error, 'No se pudo actualizar el cliente.');
    }

    return this.toClient(data);
  }

  private toClient(row: CustomerRow): Client {
    return {
      id: row.id,
      dni: row.document_number,
      fullName: row.full_name,
      phone: row.phone ?? '',
      address: row.address ?? '',
      collectorId: row.collector_id,
      notes: row.notes ?? '',
      active: row.active,
      createdAt: row.created_at,
    };
  }

  private createError(error: unknown): AppError {
    return this.mutationError(error, 'No se pudo registrar el cliente.');
  }

  private mutationError(error: unknown, fallbackMessage: string): AppError {
    const code = this.errorCode(error);
    const message = this.errorMessage(error);

    if (code === '23505') {
      return new AppError('VALIDATION', 'Ya existe un cliente con ese DNI.', error);
    }

    if (code === '23503' || message.includes('active collector')) {
      return new AppError(
        'VALIDATION',
        'Seleccioná un cobrador activo válido.',
        error,
      );
    }

    if (code === '23514' && message.includes('CUSTOMER_HAS_ACTIVE_LOAN')) {
      return new AppError(
        'VALIDATION',
        'No podés desactivar al cliente mientras tenga un préstamo activo.',
        error,
      );
    }

    return this.toAppError(error, fallbackMessage);
  }

  private toAppError(error: unknown, fallbackMessage: string): AppError {
    const code = this.errorCode(error);

    if (code === '42501') {
      return new AppError(
        'AUTH_UNAUTHORIZED',
        'No tenés permisos para realizar esta acción.',
        error,
      );
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
