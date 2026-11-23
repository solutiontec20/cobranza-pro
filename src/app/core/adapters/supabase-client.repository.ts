import { inject, Service } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../errors/app-error';
import {
  Client,
  ClientCollectorOption,
  ClientListItem,
  ClientListQuery,
  ClientPage,
  CreateClientInput,
  UpdateClientInput,
} from '../models/client.model';
import { ClientRepository } from '../repositories/client.repository';
import { Database } from '../supabase/database.types';
import { SUPABASE } from '../supabase/supabase-client';

type CustomerRow = Database['public']['Tables']['customers']['Row'];
type ClientPageRow = Database['public']['Functions']['admin_list_clients_page']['Returns'][number];
type ClientItemRow = ClientPageRow & {
  active: boolean;
  address: string;
  collector_id: string;
  collector_name: string;
  created_at: string;
  document_number: string;
  full_name: string;
  id: string;
  is_blacklisted: boolean;
  max_overdue_days: number;
  outstanding_amount: number;
};

@Service({ autoProvided: false })
export class SupabaseClientRepository implements ClientRepository {
  private readonly supabase = inject(SUPABASE) as SupabaseClient<Database>;

  async list(query: ClientListQuery, abortSignal?: AbortSignal): Promise<ClientPage> {
    const pageIndex = Math.max(0, query.pageIndex);
    const pageSize = Math.min(100, Math.max(1, query.pageSize));
    const search = query.search.trim();
    let pageQuery = this.supabase.rpc('admin_list_clients_page', {
      p_page_index: pageIndex,
      p_page_size: pageSize,
      p_search: search || undefined,
      p_collector_id: query.collectorId ?? undefined,
    });

    if (abortSignal) {
      pageQuery = pageQuery.abortSignal(abortSignal);
    }

    const { data, error } = await pageQuery;

    if (error) {
      throw this.toAppError(error, 'No se pudo cargar la lista de clientes.');
    }

    const rows = data ?? [];
    return {
      items: rows
        .filter((row) => this.isClientItemRow(row))
        .map((row) => this.toClientListItem(row)),
      total: Number(rows[0]?.total_count ?? 0),
    };
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

  private isClientItemRow(row: ClientPageRow): row is ClientItemRow {
    return row.id !== null;
  }

  private toClientListItem(row: ClientItemRow): ClientListItem {
    return {
      id: row.id,
      dni: row.document_number,
      fullName: row.full_name,
      phone: row.phone ?? '',
      address: row.address,
      collectorId: row.collector_id,
      collectorName: row.collector_name,
      notes: row.notes ?? '',
      active: row.active,
      createdAt: row.created_at,
      outstandingAmount: Number(row.outstanding_amount),
      overdueDays: Number(row.max_overdue_days),
      isBlacklisted: row.is_blacklisted,
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
      return new AppError('VALIDATION', 'Selecciona un cobrador activo válido.', error);
    }

    if (code === '23514' && message.includes('CUSTOMER_HAS_ACTIVE_LOAN')) {
      return new AppError(
        'VALIDATION',
        'No puedes desactivar al cliente mientras tenga un préstamo activo.',
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
        'No tienes permisos para realizar esta acción.',
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
