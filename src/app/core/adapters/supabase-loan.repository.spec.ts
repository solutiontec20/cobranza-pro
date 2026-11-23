import { TestBed } from '@angular/core/testing';
import { SUPABASE } from '../supabase/supabase-client';
import { SupabaseLoanRepository } from './supabase-loan.repository';

describe('SupabaseLoanRepository', () => {
  const order = vi.fn();
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn<(table: string) => unknown>(() => ({ select }));
  const rpc = vi.fn();
  let repository: SupabaseLoanRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [SupabaseLoanRepository, { provide: SUPABASE, useValue: { from, rpc } }],
    });
    repository = TestBed.inject(SupabaseLoanRepository);
  });

  it('loads ordered installment balances and identifies partial payments', async () => {
    order.mockResolvedValue({
      data: [
        {
          id: 'installment-1',
          loan_id: 'loan-1',
          installment_number: 1,
          due_date: '2026-10-20',
          scheduled_amount: 4,
          paid_amount: 1,
          outstanding_amount: 3,
          status: 'pending',
          overdue_days: 0,
        },
      ],
      error: null,
    });

    await expect(repository.getSchedule('loan-1')).resolves.toEqual([
      {
        id: 'installment-1',
        loanId: 'loan-1',
        installmentNumber: 1,
        dueDate: '2026-10-20',
        scheduledAmount: 4,
        paidAmount: 1,
        outstandingAmount: 3,
        status: 'partial',
        overdueDays: 0,
      },
    ]);
    expect(eq).toHaveBeenCalledWith('loan_id', 'loan-1');
    expect(order).toHaveBeenCalledWith('installment_number', { ascending: true });
  });

  it('maps a paginated loan summary without loading unbounded related rows', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: 'loan-1',
          customer_id: 'customer-1',
          client_name: 'Ana Flores',
          client_dni: '45678901',
          collector_id: 'collector-1',
          collector_name: 'Luis Ramos',
          principal_amount: 120,
          interest_rate_percent: 0,
          total_amount: 120,
          installment_count: 30,
          installment_amount: 4,
          frequency: 'daily',
          started_on: '2026-10-01',
          end_date: '2026-11-04',
          balance: 90,
          status: 'active',
          created_at: '2026-10-01T12:00:00Z',
          total_count: 87,
        },
      ],
      error: null,
    });

    await expect(
      repository.listPage({
        pageIndex: 0,
        pageSize: 10,
        search: '',
        status: null,
        collectorId: null,
        frequency: null,
      }),
    ).resolves.toEqual({
      items: [
        {
          id: 'loan-1',
          clientId: 'customer-1',
          clientName: 'Ana Flores',
          clientDni: '45678901',
          collectorId: 'collector-1',
          collectorName: 'Luis Ramos',
          principal: 120,
          interestRate: 0,
          totalAmount: 120,
          installmentAmount: 4,
          installmentCount: 30,
          frequency: 'daily',
          balance: 90,
          status: 'active',
          startedOn: '2026-10-01',
          endDate: '2026-11-04',
          createdAt: '2026-10-01T12:00:00Z',
        },
      ],
      total: 87,
    });
    expect(rpc).toHaveBeenCalledWith('admin_list_loans_page', {
      p_page_index: 0,
      p_page_size: 10,
      p_search: undefined,
      p_status: undefined,
      p_collector_id: undefined,
      p_frequency: undefined,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('loads active collector options independently from the current loan page', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: 'collector-2',
          full_name: 'Luis Ramos',
          dni: '70000002',
          phone: null,
          active: true,
          active_customer_count: 12,
          created_at: '2026-10-01T12:00:00Z',
        },
        {
          id: 'collector-1',
          full_name: 'Ana Torres',
          dni: '70000001',
          phone: null,
          active: false,
          active_customer_count: 0,
          created_at: '2026-10-01T12:00:00Z',
        },
      ],
      error: null,
    });

    await expect(repository.listCollectorOptions()).resolves.toEqual([
      { id: 'collector-2', fullName: 'Luis Ramos' },
    ]);
    expect(rpc).toHaveBeenCalledWith('admin_list_collectors');
  });

  it.each([
    ['Only active loans may be updated', 'Solo se pueden editar préstamos activos.'],
    [
      'Loans with posted payments cannot be updated',
      'No se puede editar el préstamo mientras tenga pagos vigentes.',
    ],
    [
      'Principal cannot change after its cash closure exists',
      'No se puede cambiar el capital porque el desembolso ya forma parte de un cierre de caja.',
    ],
    [
      'Loan active schedule is inconsistent',
      'No se puede editar el préstamo porque sus datos financieros son inconsistentes.',
    ],
  ])('translates the update error %s', async (databaseMessage, expectedMessage) => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '22023', message: databaseMessage },
    });

    const promise = repository.update({
      loanId: 'loan-1',
      principal: 100,
      interestRate: 10,
      frequency: 'daily',
      installmentCount: 10,
      startedOn: '2026-10-20',
      reason: 'Corregir datos del contrato',
    });

    await expect(promise).rejects.toMatchObject({
      code: 'VALIDATION',
      message: expectedMessage,
    });
  });

  it('registers and maps a transactional payment result', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          payment_id: 'payment-1',
          allocated_amount: 36.67,
          remaining_balance: 73.33,
          resulting_loan_status: 'active',
        },
      ],
      error: null,
    });

    await expect(
      repository.registerPayment({
        loanId: 'loan-1',
        amount: 36.67,
        paymentMethod: 'cash',
        notes: ' Pago en oficina ',
      }),
    ).resolves.toEqual({
      paymentId: 'payment-1',
      allocatedAmount: 36.67,
      remainingBalance: 73.33,
      resultingLoanStatus: 'active',
    });

    expect(rpc).toHaveBeenCalledWith('register_payment', {
      p_loan_id: 'loan-1',
      p_amount: 36.67,
      p_payment_method: 'cash',
      p_notes: 'Pago en oficina',
    });
  });

  it.each([
    ['Payment exceeds outstanding loan balance', 'El monto no puede superar el saldo pendiente.'],
    [
      'Payments can only be registered on active loans',
      'Solo se pueden registrar pagos en préstamos activos.',
    ],
    ['Loan has no outstanding balance', 'El préstamo no tiene saldo pendiente.'],
  ])('translates the payment error %s', async (databaseMessage, expectedMessage) => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '22023', message: databaseMessage },
    });

    const promise = repository.registerPayment({
      loanId: 'loan-1',
      amount: 36.67,
      paymentMethod: 'cash',
      notes: '',
    });

    await expect(promise).rejects.toMatchObject({
      code: 'VALIDATION',
      message: expectedMessage,
    });
  });

  it('voids selected payments with one bulk RPC and maps its summary', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          loan_id: 'loan-1',
          voided_count: 2,
          voided_amount: 8,
          remaining_balance: 110,
        },
      ],
      error: null,
    });

    await expect(
      repository.voidPaymentsBulk({
        loanId: 'loan-1',
        paymentIds: ['payment-1', 'payment-2'],
        reason: ' Pagos duplicados confirmados ',
      }),
    ).resolves.toEqual({
      loanId: 'loan-1',
      voidedCount: 2,
      voidedAmount: 8,
      remainingBalance: 110,
    });

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('void_payments_bulk', {
      p_loan_id: 'loan-1',
      p_payment_ids: ['payment-1', 'payment-2'],
      p_reason: 'Pagos duplicados confirmados',
    });
  });

  it('exposes a validation error when a selected payment is no longer posted', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: '22023',
        message: 'All selected payments must belong to the loan and be posted',
      },
    });

    await expect(
      repository.voidPaymentsBulk({
        loanId: 'loan-1',
        paymentIds: ['payment-1'],
        reason: 'Pago duplicado confirmado',
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      message: 'Todos los pagos seleccionados deben estar vigentes y pertenecer al préstamo.',
    });
  });

  it('renews a loan and maps the resulting row', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          loan_id: 'loan-2',
          customer_id: 'customer-1',
          previous_loan_id: 'loan-1',
          total_amount: 110,
          disbursed_amount: 26.67,
          base_installment_amount: 36.67,
          last_installment_amount: 36.66,
          first_due_on: '2026-10-24',
        },
      ],
      error: null,
    });

    await expect(
      repository.renew({
        loanId: 'loan-1',
        principal: 100,
        interestRate: 10,
        frequency: 'daily',
        installmentCount: 3,
        startedOn: '2026-10-24',
      }),
    ).resolves.toEqual({
      loanId: 'loan-2',
      clientId: 'customer-1',
      previousLoanId: 'loan-1',
      totalAmount: 110,
      disbursedAmount: 26.67,
      baseInstallmentAmount: 36.67,
      lastInstallmentAmount: 36.66,
      firstDueOn: '2026-10-24',
    });

    expect(rpc).toHaveBeenCalledWith('renew_loan', {
      p_loan_id: 'loan-1',
      p_principal: 100,
      p_interest_rate: 10,
      p_frequency: 'daily',
      p_installment_count: 3,
      p_started_on: '2026-10-24',
    });
  });

  it.each([
    [
      'Blacklisted customers cannot renew their loan',
      'El cliente es moroso (más de 5 días de atraso) y no puede renovar su préstamo.',
    ],
    [
      'Only active or fully paid loans can be renewed',
      'Solo se pueden renovar préstamos activos o totalmente pagados.',
    ],
    [
      'Principal must be at least the outstanding balance of the previous loan',
      'El nuevo capital debe ser al menos igual al saldo pendiente del préstamo anterior.',
    ],
  ])('translates the renewal error %s', async (databaseMessage, expectedMessage) => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '22023', message: databaseMessage },
    });

    const promise = repository.renew({
      loanId: 'loan-1',
      principal: 100,
      interestRate: 10,
      frequency: 'daily',
      installmentCount: 3,
      startedOn: '2026-10-24',
    });

    await expect(promise).rejects.toMatchObject({
      code: 'VALIDATION',
      message: expectedMessage,
    });
  });

  it('translates an authorization failure on renewal', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'Collector cannot renew loans for another portfolio' },
    });

    const promise = repository.renew({
      loanId: 'loan-1',
      principal: 100,
      interestRate: 10,
      frequency: 'daily',
      installmentCount: 3,
      startedOn: '2026-10-24',
    });

    await expect(promise).rejects.toMatchObject({
      code: 'AUTH_UNAUTHORIZED',
      message: 'No tenés permisos para renovar este préstamo.',
    });
  });
});
