import { inject, Service } from '@angular/core';
import {
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from '@supabase/supabase-js';

import { AppError } from '../errors/app-error';
import {
  CorrectionRequest,
  CorrectionRequestChange,
  CorrectionRequestChangeEvent,
  CorrectionRequestReceipt,
  CorrectionRequestResolution,
  CorrectionRequestSubscription,
  CreateCorrectionRequestInput,
  RejectCorrectionRequestInput,
  ResolveCorrectionRequestInput,
  ResolveEditLoanRequestInput,
} from '../models/correction-request.model';
import { CorrectionRequestRepository } from '../repositories/correction-request.repository';
import { Database, Json } from '../supabase/database.types';
import { SUPABASE } from '../supabase/supabase-client';

type ListRow = Database['public']['Functions']['list_correction_requests']['Returns'][number];
type MyListRow = Database['public']['Functions']['list_my_correction_requests']['Returns'][number];
type RealtimeRow = Database['public']['Tables']['correction_requests']['Row'];
type CreateRow = Database['public']['Functions']['create_correction_request']['Returns'][number];
type ResolutionRow =
  Database['public']['Functions']['reject_correction_request']['Returns'][number];

@Service({ autoProvided: false })
export class SupabaseCorrectionRequestRepository implements CorrectionRequestRepository {
  private readonly supabase = inject(SUPABASE) as SupabaseClient<Database>;

  async list(status: Parameters<CorrectionRequestRepository['list']>[0], limit = 100) {
    const { data, error } = await this.supabase.rpc('list_correction_requests', {
      p_status: status ?? undefined,
      p_limit: limit,
    });

    if (error) throw this.toAppError(error, 'No se pudieron cargar las solicitudes.');
    return (data ?? []).map((row) => this.mapRequest(row));
  }

  async countPending(): Promise<number> {
    const { data, error } = await this.supabase.rpc('count_pending_correction_requests');

    if (error) throw this.toAppError(error, 'No se pudo cargar el contador de solicitudes.');
    return Number(data ?? 0);
  }

  async listMine(limit = 20): Promise<CorrectionRequest[]> {
    const { data, error } = await this.supabase.rpc('list_my_correction_requests', {
      p_limit: limit,
    });

    if (error) throw this.toAppError(error, 'No se pudieron cargar tus solicitudes.');
    return (data ?? []).map((row) => this.mapRequest(row));
  }

  async countMineUnread(): Promise<number> {
    const { data, error } = await this.supabase.rpc('count_my_unread_correction_requests');

    if (error) throw this.toAppError(error, 'No se pudo cargar el contador de notificaciones.');
    return Number(data ?? 0);
  }

  async markMineRead(): Promise<number> {
    const { data, error } = await this.supabase.rpc('mark_my_correction_requests_read');

    if (error) throw this.toAppError(error, 'No se pudieron marcar las notificaciones como leídas.');
    return Number(data ?? 0);
  }

  subscribe(
    subscription: CorrectionRequestSubscription,
    onChange: (change: CorrectionRequestChange) => void,
    onStatus?: Parameters<CorrectionRequestRepository['subscribe']>[2],
  ): () => void {
    const channel = this.supabase.channel(`correction-requests:${subscription.userId}`);
    const emit = (
      eventType: CorrectionRequestChangeEvent,
      payload: RealtimePostgresChangesPayload<RealtimeRow>,
    ) => {
      const change = this.mapRealtimeChange(eventType, payload.new);
      if (change) onChange(change);
    };

    if (subscription.role === 'collector') {
      channel.on<RealtimeRow>(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'correction_requests',
          filter: `requested_by=eq.${subscription.userId}`,
        },
        (payload) => emit('UPDATE', payload),
      );
    } else {
      channel
        .on<RealtimeRow>(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'correction_requests' },
          (payload) => emit('INSERT', payload),
        )
        .on<RealtimeRow>(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'correction_requests' },
          (payload) => emit('UPDATE', payload),
        );
    }

    channel.subscribe((status) => onStatus?.(status));

    return () => {
      void this.supabase.removeChannel(channel);
    };
  }

  async create(input: CreateCorrectionRequestInput): Promise<CorrectionRequestReceipt> {
    const { data, error } = await this.supabase.rpc('create_correction_request', {
      p_request_type: input.requestType,
      p_loan_id: input.loanId,
      p_payment_id: input.paymentId ?? undefined,
      p_reason: input.reason,
      p_proposed_changes: (input.proposedChanges as Json | null) ?? undefined,
    });

    if (error) throw this.toAppError(error, 'No se pudo enviar la solicitud.');
    return this.mapReceipt(this.requireFirst(data, 'La solicitud no devolvió una confirmación.'));
  }

  async reject(input: RejectCorrectionRequestInput): Promise<CorrectionRequestResolution> {
    const { data, error } = await this.supabase.rpc('reject_correction_request', {
      p_request_id: input.requestId,
      p_resolution_note: input.resolutionNote,
    });

    if (error) throw this.toAppError(error, 'No se pudo rechazar la solicitud.');
    return this.mapResolution(
      this.requireFirst(data, 'La resolución no devolvió una confirmación.'),
    );
  }

  async resolveEdit(input: ResolveEditLoanRequestInput): Promise<CorrectionRequestResolution> {
    const { data, error } = await this.supabase.rpc('resolve_edit_loan_request', {
      p_request_id: input.requestId,
      p_principal: input.principal,
      p_interest_rate: input.interestRate,
      p_frequency: input.frequency,
      p_installment_count: input.installmentCount,
      p_started_on: input.startedOn,
      p_reason: input.reason,
    });

    if (error) throw this.toAppError(error, 'No se pudo aplicar la edición solicitada.');
    return this.mapResolution(
      this.requireFirst(data, 'La resolución no devolvió una confirmación.'),
    );
  }

  async resolveVoidLoan(
    input: ResolveCorrectionRequestInput,
  ): Promise<CorrectionRequestResolution> {
    return this.resolveVoid('resolve_void_loan_request', input, 'No se pudo anular el préstamo.');
  }

  async resolveVoidPayment(
    input: ResolveCorrectionRequestInput,
  ): Promise<CorrectionRequestResolution> {
    return this.resolveVoid('resolve_void_payment_request', input, 'No se pudo anular el pago.');
  }

  private async resolveVoid(
    rpc: 'resolve_void_loan_request' | 'resolve_void_payment_request',
    input: ResolveCorrectionRequestInput,
    fallbackMessage: string,
  ): Promise<CorrectionRequestResolution> {
    const { data, error } = await this.supabase.rpc(rpc, {
      p_request_id: input.requestId,
      p_resolution_note: input.resolutionNote,
    });

    if (error) throw this.toAppError(error, fallbackMessage);
    return this.mapResolution(
      this.requireFirst(data, 'La resolución no devolvió una confirmación.'),
    );
  }

  private mapRequest(row: ListRow | MyListRow): CorrectionRequest {
    return {
      id: row.id,
      requestType: row.request_type,
      status: row.status,
      loanId: row.loan_id,
      paymentId: row.payment_id ?? null,
      requestedBy: row.requested_by,
      reason: row.reason,
      proposedChanges: this.asRecord(row.proposed_changes),
      handledBy: row.handled_by ?? null,
      handledAt: row.handled_at ?? null,
      resolutionNote: row.resolution_note ?? null,
      createdAt: row.created_at,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerDocument: row.customer_document,
      collectorId: row.collector_id,
      collectorName: row.collector_name,
      loanStatus: row.loan_status,
      loanFrequency: row.loan_frequency,
      loanStartedOn: row.loan_started_on,
      loanPrincipal: Number(row.loan_principal),
      loanInterestRate: Number(row.loan_interest_rate),
      loanInstallmentCount: Number(row.loan_installment_count),
      loanTotal: Number(row.loan_total),
      paymentAmount: row.payment_amount === null ? null : Number(row.payment_amount),
      paymentDate: row.payment_date ?? null,
      paymentStatus: row.payment_status ?? null,
      paymentMethod: row.payment_method ?? null,
      readAt: 'read_at' in row ? row.read_at ?? null : null,
    };
  }

  private mapRealtimeChange(
    eventType: CorrectionRequestChangeEvent,
    row: Partial<RealtimeRow>,
  ): CorrectionRequestChange | null {
    if (
      !row.id ||
      !row.request_type ||
      !row.status ||
      !row.loan_id ||
      !row.requested_by
    ) {
      return null;
    }

    return {
      eventType,
      requestId: row.id,
      requestType: row.request_type,
      status: row.status,
      loanId: row.loan_id,
      paymentId: row.payment_id ?? null,
      requestedBy: row.requested_by,
      handledBy: row.handled_by ?? null,
      handledAt: row.handled_at ?? null,
      resolutionNote: row.resolution_note ?? null,
    };
  }

  private mapReceipt(row: CreateRow): CorrectionRequestReceipt {
    return {
      requestId: row.request_id,
      requestType: row.request_type,
      requestStatus: row.request_status,
      createdAt: row.created_at,
    };
  }

  private mapResolution(row: ResolutionRow): CorrectionRequestResolution {
    return {
      requestId: row.id,
      requestStatus: row.status,
      handledAt: row.handled_at,
    };
  }

  private requireFirst<T>(rows: T[] | null, message: string): T {
    const row = rows?.[0];
    if (!row) throw new AppError('SUPABASE_RPC', message);
    return row;
  }

  private asRecord(value: Json): Record<string, unknown> | null {
    if (!value || Array.isArray(value) || typeof value !== 'object') return null;
    return value;
  }

  private toAppError(error: unknown, fallbackMessage: string): AppError {
    const code = this.errorCode(error);
    const message = this.errorMessage(error);

    if (code === 'PGRST202' || message.toLowerCase().includes('create_correction_request')) {
      return new AppError(
        'SUPABASE_RPC',
        'El módulo de solicitudes todavía no está habilitado en este entorno.',
        error,
      );
    }

    if (code === '42501') {
      return new AppError(
        'AUTH_UNAUTHORIZED',
        'No tenés permisos para realizar esta acción.',
        error,
      );
    }

    const validationMessage = this.validationMessage(message);
    if (validationMessage || code === '22023' || code === '23505' || code === '23514') {
      return new AppError('VALIDATION', validationMessage ?? fallbackMessage, error);
    }

    return new AppError('SUPABASE_RPC', fallbackMessage, error);
  }

  private validationMessage(message: string): string | null {
    const normalized = message.toLowerCase();
    const rules: Array<[string, string]> = [
      [
        'pending correction request already exists',
        'Ya existe una solicitud pendiente para esta acción.',
      ],
      ['loan does not belong to the collector portfolio', 'El préstamo no pertenece a tu cartera.'],
      ['only active loans may be edited or voided', 'Solo se pueden corregir préstamos activos.'],
      [
        'only posted payments may be requested',
        'Solo se puede solicitar la anulación de pagos vigentes.',
      ],
      [
        'payments on renewed or voided loans',
        'No se puede anular un pago de un préstamo renovado o anulado.',
      ],
      ['correction request has already been handled', 'La solicitud ya fue atendida.'],
      [
        'loans with posted payments cannot be voided',
        'Anulá primero los pagos vigentes del préstamo.',
      ],
      ['loan has payment history', 'No se puede editar un préstamo con historial de pagos.'],
      ['reason must contain', 'El motivo no cumple con la longitud requerida.'],
      [
        'resolution note must contain',
        'El motivo de la resolución debe tener entre 5 y 1000 caracteres.',
      ],
    ];

    return rules.find(([fragment]) => normalized.includes(fragment))?.[1] ?? null;
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
