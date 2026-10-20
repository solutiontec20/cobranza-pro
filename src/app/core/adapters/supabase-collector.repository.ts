import { inject, Service } from '@angular/core';
import { FunctionsHttpError, SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../errors/app-error';
import {
  Collector,
  CreateCollectorInput,
  SetCollectorActiveInput,
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
      let message = 'No se pudo crear el cobrador.';

      if (error instanceof FunctionsHttpError) {
        try {
          const body = (await error.context.json()) as { message?: string };
          message = body.message ?? message;
        } catch {
          // The response can be empty for infrastructure errors.
        }
      }

      throw new AppError('SUPABASE_RPC', message, error);
    }

    if (!data?.collector) {
      throw new AppError('SUPABASE_RPC', 'La creación no devolvió el cobrador registrado.');
    }

    return this.toCollector(data.collector);
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
}
