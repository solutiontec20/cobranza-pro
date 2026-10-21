import { TestBed } from '@angular/core/testing';
import { SUPABASE } from '../supabase/supabase-client';
import { SupabaseLoanRepository } from './supabase-loan.repository';

describe('SupabaseLoanRepository', () => {
  const order = vi.fn();
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const rpc = vi.fn();
  let repository: SupabaseLoanRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        SupabaseLoanRepository,
        { provide: SUPABASE, useValue: { from, rpc } },
      ],
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
          scheduled_amount: 40,
          paid_amount: 10,
          outstanding_amount: 30,
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
        scheduledAmount: 40,
        paidAmount: 10,
        outstandingAmount: 30,
        status: 'partial',
        overdueDays: 0,
      },
    ]);
    expect(eq).toHaveBeenCalledWith('loan_id', 'loan-1');
    expect(order).toHaveBeenCalledWith('installment_number', { ascending: true });
  });

  it.each([
    [
      'Only active loans may be updated',
      'Solo se pueden editar préstamos activos.',
    ],
    [
      'Loans with payment history cannot be updated',
      'No se puede editar un préstamo con historial de pagos.',
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
    ['Payments can only be registered on active loans', 'Solo se pueden registrar pagos en préstamos activos.'],
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
});
