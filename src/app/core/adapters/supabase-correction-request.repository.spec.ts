import { TestBed } from '@angular/core/testing';

import { SUPABASE } from '../supabase/supabase-client';
import { SupabaseCorrectionRequestRepository } from './supabase-correction-request.repository';

const listRow = {
  id: 'request-1',
  request_type: 'void_payment',
  status: 'pending',
  loan_id: 'loan-1',
  payment_id: 'payment-1',
  requested_by: 'collector-1',
  reason: 'El pago fue registrado dos veces.',
  proposed_changes: null,
  handled_by: null,
  handled_at: null,
  resolution_note: null,
  created_at: '2026-11-01T10:00:00Z',
  customer_id: 'customer-1',
  customer_name: 'Cliente Uno',
  customer_document: '12345678',
  collector_id: 'collector-1',
  collector_name: 'Cobrador Uno',
  loan_status: 'active',
  loan_frequency: 'daily',
  loan_started_on: '2026-10-31',
  loan_principal: 100,
  loan_interest_rate: 20,
  loan_installment_count: 30,
  loan_total: 120,
  payment_amount: 4,
  payment_date: '2026-11-01',
  payment_status: 'posted',
  payment_method: 'cash',
} as const;

describe('SupabaseCorrectionRequestRepository', () => {
  const rpc = vi.fn();
  const channelOn = vi.fn();
  const channelSubscribe = vi.fn();
  const removeChannel = vi.fn().mockResolvedValue('ok');
  const channel = { on: channelOn, subscribe: channelSubscribe };
  const createChannel = vi.fn();
  let repository: SupabaseCorrectionRequestRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    channelOn.mockReturnValue(channel);
    channelSubscribe.mockReturnValue(channel);
    createChannel.mockReturnValue(channel);
    TestBed.configureTestingModule({
      providers: [
        SupabaseCorrectionRequestRepository,
        { provide: SUPABASE, useValue: { rpc, channel: createChannel, removeChannel } },
      ],
    });
    repository = TestBed.inject(SupabaseCorrectionRequestRepository);
  });

  it('maps the administrative request list', async () => {
    rpc.mockResolvedValueOnce({ data: [listRow], error: null });

    const requests = await repository.list('pending', 5);

    expect(rpc).toHaveBeenCalledWith('list_correction_requests', {
      p_status: 'pending',
      p_limit: 5,
    });
    expect(requests[0]).toMatchObject({
      id: 'request-1',
      requestType: 'void_payment',
      customerName: 'Cliente Uno',
      paymentAmount: 4,
    });
  });

  it('creates a collector request with the exact selected payment', async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          request_id: 'request-1',
          request_type: 'void_payment',
          request_status: 'pending',
          created_at: '2026-11-01T10:00:00Z',
        },
      ],
      error: null,
    });

    const result = await repository.create({
      requestType: 'void_payment',
      loanId: 'loan-1',
      paymentId: 'payment-1',
      reason: 'El pago fue registrado dos veces.',
    });

    expect(rpc).toHaveBeenCalledWith('create_correction_request', {
      p_request_type: 'void_payment',
      p_loan_id: 'loan-1',
      p_payment_id: 'payment-1',
      p_reason: 'El pago fue registrado dos veces.',
      p_proposed_changes: undefined,
    });
    expect(result.requestId).toBe('request-1');
  });

  it('maps the collector notification list including its read state', async () => {
    rpc.mockResolvedValueOnce({
      data: [{ ...listRow, status: 'rejected', read_at: '2026-11-01T12:00:00Z' }],
      error: null,
    });

    const requests = await repository.listMine(5);

    expect(rpc).toHaveBeenCalledWith('list_my_correction_requests', { p_limit: 5 });
    expect(requests[0]).toMatchObject({
      id: 'request-1',
      status: 'rejected',
      readAt: '2026-11-01T12:00:00Z',
    });
  });

  it('subscribes a collector only to updates for their own requests and removes the channel', () => {
    const onChange = vi.fn();

    const unsubscribe = repository.subscribe(
      { userId: 'collector-1', role: 'collector' },
      onChange,
    );

    expect(createChannel).toHaveBeenCalledWith('correction-requests:collector-1');
    expect(channelOn).toHaveBeenCalledWith(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'correction_requests',
        filter: 'requested_by=eq.collector-1',
      },
      expect.any(Function),
    );

    const realtimeCallback = channelOn.mock.calls[0]?.[2] as
      | ((payload: { new: Record<string, unknown> }) => void)
      | undefined;
    realtimeCallback?.({
      new: {
        id: 'request-1',
        request_type: 'void_payment',
        status: 'resolved',
        loan_id: 'loan-1',
        payment_id: 'payment-1',
        requested_by: 'collector-1',
        handled_by: 'admin-1',
        handled_at: '2026-11-01T11:00:00Z',
        resolution_note: 'Pago duplicado confirmado.',
      },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'UPDATE',
        requestId: 'request-1',
        status: 'resolved',
      }),
    );

    unsubscribe();
    expect(removeChannel).toHaveBeenCalledWith(channel);
  });

  it('translates a duplicate request into a user-facing validation error', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: '23505',
        message: 'A pending correction request already exists for this record and action',
      },
    });

    await expect(
      repository.create({
        requestType: 'void_loan',
        loanId: 'loan-1',
        reason: 'El préstamo fue creado por error.',
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      message: 'Ya existe una solicitud pendiente para esta acción.',
    });
  });

  it('explains when the correction-request migration is missing from the current environment', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.create_correction_request in the schema cache',
      },
    });

    await expect(
      repository.create({
        requestType: 'edit_loan',
        loanId: 'loan-1',
        reason: 'El capital debe ser revisado.',
      }),
    ).rejects.toMatchObject({
      code: 'SUPABASE_RPC',
      message: 'El módulo de solicitudes todavía no está habilitado en este entorno.',
    });
  });

  it('maps a resolved payment void request', async () => {
    rpc.mockResolvedValueOnce({
      data: [{ id: 'request-1', status: 'resolved', handled_at: '2026-11-01T11:00:00Z' }],
      error: null,
    });

    const result = await repository.resolveVoidPayment({
      requestId: 'request-1',
      resolutionNote: 'Pago duplicado confirmado.',
    });

    expect(result).toEqual({
      requestId: 'request-1',
      requestStatus: 'resolved',
      handledAt: '2026-11-01T11:00:00Z',
    });
  });
});
