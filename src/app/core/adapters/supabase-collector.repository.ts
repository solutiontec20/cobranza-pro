import { inject, Service } from '@angular/core';
import { FunctionsHttpError, SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../errors/app-error';
import {
  Collector,
  CreateCollectorInput,
  ResetCollectorPinInput,
  ResetCollectorPinResult,
  SetCollectorActiveInput,
  UpdateCollectorInput,
} from '../models/collector.model';
import { CollectorRepository } from '../repositories/collector.repository';
import { Database } from '../supabase/database.types';
import { SUPABASE } from '../supabase/supabase-client';

type CollectorRow = Database['public']['Functions']['admin_list_collectors']['Returns'][number];

@Service({ autoProvided: false })
export class SupabaseCollectorRepository implements CollectorRepository {
  private readonly supabase = inject(SUPABASE) as SupabaseClient<Database>;

  async list(): Promise<Collector[]> {
    const { data, error } = await this.supabase.rpc('admin_list_collectors');

    if (error) {
      throw this.toAppError(error, 'No se pudo cargar la lista de cobradores.');
    }

    return (data ?? []).map((row) => this.toCollector(row));
  }

  async create(input: CreateCollectorInput): Promise<Collector> {
    const { data, error } = await this.supabase.functions.invoke<{
      collector: CollectorRow;
    }>('admin-create-collector', { body: input });

    if (error) {
      throw await this.functionError(error, 'No se pudo crear el cobrador.');
    }

    if (!data?.collector) {
      throw new AppError('SUPABASE_RPC', 'La creación no devolvió el cobrador registrado.');
    }

    return this.toCollector(data.collector);
  }

  async resetPin(input: ResetCollectorPinInput): Promise<ResetCollectorPinResult> {
    const { data, error } = await this.supabase.functions.invoke<ResetCollectorPinResult>(
      'admin-reset-collector-pin',
      { body: input },
    );

    if (error) {
      throw await this.functionError(error, 'No se pudo restablecer el PIN.');
    }

    if (!data?.temporaryPin) {
      throw new AppError('SUPABASE_RPC', 'El restablecimiento no devolvió un PIN temporal.');
    }

    return data;
  }

  async setActive(input: SetCollectorActiveInput): Promise<Collector> {
    const { data, error } = await this.supabase.rpc('admin_set_collector_active', {
      p_collector_id: input.collectorId,
      p_active: input.active,
      p_reason: input.reason,
    });

    if (error) {
      if (error.message.includes('COLLECTOR_HAS_ACTIVE_CUSTOMERS')) {
        throw new AppError(
          'VALIDATION',
          'No podés desactivar al cobrador mientras tenga clientes activos. Reasigná su cartera primero.',
          error,
        );
      }

      throw this.toAppError(error, 'No se pudo actualizar el estado del cobrador.');
    }

    const row = data?.[0];
    if (!row) {
      throw new AppError('SUPABASE_RPC', 'La actualización no devolvió el cobrador.');
    }

    return this.toCollector(row);
  }

  async update(input: UpdateCollectorInput): Promise<Collector> {
    const { data, error } = await this.supabase.rpc('admin_update_collector_profile', {
      p_collector_id: input.collectorId,
      p_full_name: input.fullName,
      p_phone: input.phone ?? undefined,
      p_reason: input.reason,
    });

    if (error) {
      throw this.updateError(error);
    }

    const row = data?.[0];
    if (!row) {
      throw new AppError('SUPABASE_RPC', 'La edición no devolvió el cobrador actualizado.');
    }

    return this.toCollector(row);
  }

  private updateError(error: unknown): AppError {
    const message = error instanceof Error ? error.message : '';

    if (message.includes('COLLECTOR_UPDATE_FORBIDDEN')) {
      return new AppError('AUTH_UNAUTHORIZED', 'Solo un administrador puede editar los datos del cobrador.', error);
    }
    if (message.includes('COLLECTOR_UPDATE_REASON_REQUIRED')) {
      return new AppError('VALIDATION', 'Ingresá el motivo de la edición.', error);
    }
    if (message.includes('COLLECTOR_NAME_REQUIRED')) {
      return new AppError('VALIDATION', 'Ingresá el nombre completo del cobrador.', error);
    }
    if (message.includes('COLLECTOR_PHONE_INVALID')) {
      return new AppError('VALIDATION', 'El teléfono debe contener 9 dígitos e iniciar en 9.', error);
    }
    if (message.includes('COLLECTOR_NOT_FOUND')) {
      return new AppError('VALIDATION', 'No se encontró el cobrador.', error);
    }

    return this.toAppError(error, 'No se pudo editar el cobrador.');
  }

  private toCollector(row: CollectorRow): Collector {
    return {
      id: row.id,
      dni: row.dni,
      fullName: row.full_name,
      phone: row.phone,
      active: row.active,
      createdAt: row.created_at,
      activeCustomerCount: Number(row.active_customer_count),
    };
  }

  private toAppError(error: unknown, fallbackMessage: string) {
    const message = error instanceof Error ? error.message : fallbackMessage;
    return new AppError('SUPABASE_RPC', message || fallbackMessage, error);
  }

  private async functionError(error: unknown, fallback: string): Promise<AppError> {
    let message = fallback;

    if (error instanceof FunctionsHttpError) {
      try {
        const body = (await error.context.json()) as { message?: string };
        message = body.message ?? message;
      } catch {
        // Infrastructure errors may return an empty response.
      }
    }

    return new AppError('SUPABASE_RPC', message, error);
  }
}
