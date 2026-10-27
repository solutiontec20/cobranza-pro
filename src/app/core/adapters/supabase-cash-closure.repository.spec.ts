import { TestBed } from '@angular/core/testing';
import { SUPABASE } from '../supabase/supabase-client';
import { SupabaseCashClosureRepository } from './supabase-cash-closure.repository';

// EN
/** A query-builder stub that stays chainable through any number of .select()/.eq()/.order()
 * calls and resolves to `result` the moment it is awaited — avoids hard-coding how many
 * `.eq()` calls each query makes (that depends on whether a collectorId filter is present). */

// ES
/** Un componente auxiliar para la construcción de consultas que permite el encadenamiento de cualquier número de llamadas a `.select()`, `.eq()` u `.order()`,
 *  y que se resuelve en `result` en el momento en que se utiliza `await`. Esto evita tener que definir de forma fija cuántas llamadas a `.eq()` realiza cada consulta (lo cual depende de si existe
 *  o no un filtro `collectorId`). */

function chain(result: { data: unknown; error: unknown }) {
  const node: Record<string, unknown> = {};
  node['select'] = vi.fn(() => node);
  node['eq'] = vi.fn(() => node);
  node['order'] = vi.fn(() => node);
  node['then'] = (resolve: (value: unknown) => unknown) => resolve(result);
  return node;
}

describe('SupabaseCashClosureRepository', () => {
  const from = vi.fn<(table: string) => unknown>();
  const rpc = vi.fn();
  const getUser = vi.fn();
  let repository: SupabaseCashClosureRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        SupabaseCashClosureRepository,
        { provide: SUPABASE, useValue: { from, rpc, auth: { getUser } } },
      ],
    });
    repository = TestBed.inject(SupabaseCashClosureRepository);
  });

  it('lists active collectors', async () => {
    from.mockReturnValueOnce(
      chain({
        data: [{ id: 'collector-1', full_name: 'Pedro Castillo' }],
        error: null,
      }),
    );

    await expect(repository.listActiveCollectors()).resolves.toEqual([
      { id: 'collector-1', fullName: 'Pedro Castillo' },
    ]);
  });

  it('maps a full breakdown + closure + expenses for a given collector and date', async () => {
    from
      .mockReturnValueOnce(
        chain({
          data: [
            {
              collector_id: 'collector-1',
              business_date: '2026-10-25',
              opening_amount: 1000,
              allowance_amount: 100,
              cash_collected_amount: 650,
              yape_collected_amount: 200,
              plin_collected_amount: 0,
              transfer_collected_amount: 0,
              voided_cash_amount: 0,
              loan_disbursement_amount: 600,
              operating_expense_amount: 50,
            },
          ],
          error: null,
        }),
      )
      .mockReturnValueOnce(
        chain({
          data: [
            {
              id: 'closure-1',
              collector_id: 'collector-1',
              business_date: '2026-10-25',
              expected_amount: 1100,
              delivered_amount: 1100,
              difference_amount: 0,
              status: 'submitted',
              observation: null,
              submitted_at: '2026-10-25T20:00:00Z',
              validated_at: null,
              validated_by: null,
            },
          ],
          error: null,
        }),
      )
      .mockReturnValueOnce(
        chain({
          data: [
            {
              id: 'expense-1',
              collector_id: 'collector-1',
              business_date: '2026-10-25',
              category: 'fuel',
              amount: 50,
              description: 'Combustible',
              status: 'approved',
              cash_movement_id: 'movement-1',
              requested_by: 'collector-1',
              reviewed_by: 'admin-1',
              reviewed_at: '2026-10-25T19:00:00Z',
              rejection_reason: null,
              created_at: '2026-10-25T18:00:00Z',
            },
          ],
          error: null,
        }),
      );

    getUser.mockResolvedValue({ data: { user: { id: 'collector-1' } }, error: null });

    const day = await repository.getOwnDay('2026-10-25');

    expect(day.breakdown).toEqual({
      collectorId: 'collector-1',
      businessDate: '2026-10-25',
      openingAmount: 1000,
      allowanceAmount: 100,
      cashCollectedAmount: 650,
      yapeCollectedAmount: 200,
      plinCollectedAmount: 0,
      transferCollectedAmount: 0,
      voidedCashAmount: 0,
      loanDisbursementAmount: 600,
      operatingExpenseAmount: 50,
    });
    expect(day.closure).toMatchObject({ id: 'closure-1', status: 'submitted', deliveredAmount: 1100 });
    expect(day.expenses).toEqual([
      expect.objectContaining({ id: 'expense-1', category: 'fuel', status: 'approved' }),
    ]);
  });

  it('returns an empty day when the collector has no movements yet', async () => {
    from
      .mockReturnValueOnce(chain({ data: [], error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }));
    getUser.mockResolvedValue({ data: { user: { id: 'collector-2' } }, error: null });

    const day = await repository.getOwnDay('2026-10-25');

    expect(day.breakdown.openingAmount).toBe(0);
    expect(day.closure).toBeNull();
    expect(day.expenses).toEqual([]);
  });

  it('fills in a zero-valued day for every active collector in listDay', async () => {
    from
      .mockReturnValueOnce(
        chain({
          data: [
            { id: 'collector-1', full_name: 'Pedro Castillo' },
            { id: 'collector-2', full_name: 'Luis Ramos' },
          ],
          error: null,
        }),
      )
      .mockReturnValueOnce(
        chain({
          data: [
            {
              collector_id: 'collector-1',
              business_date: '2026-10-25',
              opening_amount: 1000,
              allowance_amount: 0,
              cash_collected_amount: 0,
              yape_collected_amount: 0,
              plin_collected_amount: 0,
              transfer_collected_amount: 0,
              voided_cash_amount: 0,
              loan_disbursement_amount: 0,
              operating_expense_amount: 0,
            },
          ],
          error: null,
        }),
      )
      .mockReturnValueOnce(chain({ data: [], error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }));

    const days = await repository.listDay('2026-10-25');

    expect(days).toHaveLength(2);
    expect(days[0].breakdown.openingAmount).toBe(1000);
    expect(days[1].breakdown.openingAmount).toBe(0);
    expect(days[1].closure).toBeNull();
  });

  it('registers an opening float via RPC', async () => {
    rpc.mockResolvedValue({ data: [{}], error: null });

    await repository.registerOpening({
      collectorId: 'collector-1',
      businessDate: '2026-10-25',
      amount: 1000,
      notes: 'Apertura',
    });

    expect(rpc).toHaveBeenCalledWith('register_cash_opening', {
      p_collector_id: 'collector-1',
      p_business_date: '2026-10-25',
      p_amount: 1000,
      p_notes: 'Apertura',
    });
  });

  it.each([
    [
      'Opening float has already been registered for this collector and date',
      'Ya se registró la apertura de este cobrador para esta fecha.',
    ],
    [
      'Only administrators or supervisors may register an opening float',
      'Solo un administrador o supervisor puede registrar la apertura.',
    ],
  ])('translates the opening error %s', async (databaseMessage, expectedMessage) => {
    rpc.mockResolvedValue({ data: null, error: { code: '23505', message: databaseMessage } });

    const promise = repository.registerOpening({
      collectorId: 'collector-1',
      businessDate: '2026-10-25',
      amount: 1000,
      notes: '',
    });

    await expect(promise).rejects.toMatchObject({ message: expectedMessage });
  });

  it('requests a cash expense via RPC and maps the pending result', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          expense_id: 'expense-1',
          collector_id: 'collector-1',
          business_date: '2026-10-25',
          category: 'fuel',
          amount: 50,
          status: 'pending',
        },
      ],
      error: null,
    });

    await expect(
      repository.requestExpense({
        businessDate: '2026-10-25',
        category: 'fuel',
        amount: 50,
        description: 'Combustible para la ruta',
      }),
    ).resolves.toMatchObject({ id: 'expense-1', category: 'fuel', status: 'pending', amount: 50 });

    expect(rpc).toHaveBeenCalledWith('request_cash_expense', {
      p_business_date: '2026-10-25',
      p_category: 'fuel',
      p_amount: 50,
      p_description: 'Combustible para la ruta',
      p_collector_id: undefined,
    });
  });

  it('translates a rejection-reason-required error on review', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '22023', message: 'A rejection reason is required' },
    });

    const promise = repository.reviewExpense({ expenseId: 'expense-1', approve: false, reason: '' });

    await expect(promise).rejects.toMatchObject({
      code: 'VALIDATION',
      message: 'Ingresá el motivo del rechazo.',
    });
  });

  it('submits a cash closure and maps the resulting row', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'collector-1' } }, error: null });
    rpc.mockResolvedValue({
      data: [
        {
          closure_id: 'closure-1',
          expected_amount: 1100,
          delivered_amount: 1200,
          difference_amount: 100,
          closure_status: 'submitted',
        },
      ],
      error: null,
    });

    await expect(
      repository.submitClosure({
        businessDate: '2026-10-25',
        deliveredAmount: 1200,
        observation: 'Entregue de mas',
      }),
    ).resolves.toMatchObject({
      id: 'closure-1',
      collectorId: 'collector-1',
      expectedAmount: 1100,
      deliveredAmount: 1200,
      differenceAmount: 100,
      status: 'submitted',
    });
  });

  it('translates the observation-required error on submit', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'collector-1' } }, error: null });
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: '22023',
        message: 'An observation is required when the delivered amount differs from the expected amount',
      },
    });

    const promise = repository.submitClosure({
      businessDate: '2026-10-25',
      deliveredAmount: 1200,
      observation: '',
    });

    await expect(promise).rejects.toMatchObject({
      message: 'Ingresá una observación: el monto entregado no coincide con el esperado.',
    });
  });

  it('validates a cash closure via RPC', async () => {
    rpc.mockResolvedValue({ data: [{}], error: null });

    await repository.validateClosure({ closureId: 'closure-1', observation: '' });

    expect(rpc).toHaveBeenCalledWith('validate_cash_closure', {
      p_closure_id: 'closure-1',
      p_observation: undefined,
    });
  });

  it('translates an unauthorized validation error', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'Only administrators or supervisors may validate cash closures' },
    });

    const promise = repository.validateClosure({ closureId: 'closure-1', observation: '' });

    await expect(promise).rejects.toMatchObject({
      code: 'AUTH_UNAUTHORIZED',
      message: 'Solo un administrador o supervisor puede validar el cierre.',
    });
  });
});
