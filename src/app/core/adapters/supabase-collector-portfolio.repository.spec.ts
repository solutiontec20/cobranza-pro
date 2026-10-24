import { TestBed } from '@angular/core/testing';
import { SUPABASE } from '../supabase/supabase-client';
import { SupabaseCollectorPortfolioRepository } from './supabase-collector-portfolio.repository';

describe('SupabaseCollectorPortfolioRepository', () => {
  const maybeSingle = vi.fn();
  const limit = vi.fn(() => ({ maybeSingle }));
  const order = vi.fn(() => ({ limit }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn<(table: string) => unknown>(() => ({ select }));
  const rpc = vi.fn();
  let repository: SupabaseCollectorPortfolioRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        SupabaseCollectorPortfolioRepository,
        { provide: SUPABASE, useValue: { from, rpc } },
      ],
    });
    repository = TestBed.inject(SupabaseCollectorPortfolioRepository);
  });

  it('maps active-loan rows from the portfolio RPC', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          customer_id: 'customer-1',
          document_number: '45678901',
          full_name: 'Juan Pérez',
          phone: '991122334',
          address: 'Av. España 450',
          notes: 'Cliente puntual',
          loan_id: 'loan-1',
          principal_amount: 200,
          interest_rate_percent: 20,
          total_amount: 240,
          installment_count: 24,
          frequency: 'daily',
          started_on: '2026-09-15',
          first_due_on: '2026-09-15',
          loan_status: 'active',
          remaining_balance: 150,
          installment_amount: 10,
          today_scheduled_amount: 10,
          today_outstanding_amount: 0,
          today_collected_amount: 10,
          overdue_days: 0,
        },
      ],
      error: null,
    });

    await expect(repository.listPortfolio('2026-10-20')).resolves.toEqual([
      {
        customerId: 'customer-1',
        dni: '45678901',
        fullName: 'Juan Pérez',
        phone: '991122334',
        address: 'Av. España 450',
        notes: 'Cliente puntual',
        loanId: 'loan-1',
        principal: 200,
        interestRate: 20,
        totalAmount: 240,
        installmentCount: 24,
        frequency: 'daily',
        startedOn: '2026-09-15',
        firstDueOn: '2026-09-15',
        isLoanActive: true,
        remainingBalance: 150,
        installmentAmount: 10,
        todayScheduledAmount: 10,
        todayOutstandingAmount: 0,
        todayCollectedAmount: 10,
        overdueDays: 0,
      },
    ]);
    expect(rpc).toHaveBeenCalledWith('collector_list_portfolio', {
      p_business_date: '2026-10-20',
    });
  });

  it('maps a customer with no active loan as a null-loan entry', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          customer_id: 'customer-2',
          document_number: '46789012',
          full_name: 'María López',
          phone: null,
          address: null,
          notes: null,
          loan_id: null,
          principal_amount: null,
          interest_rate_percent: null,
          total_amount: null,
          installment_count: null,
          frequency: 'daily',
          started_on: null,
          first_due_on: null,
          loan_status: null,
          remaining_balance: 0,
          installment_amount: 0,
          today_scheduled_amount: 0,
          today_outstanding_amount: 0,
          today_collected_amount: 0,
          overdue_days: 0,
        },
      ],
      error: null,
    });

    const [entry] = await repository.listPortfolio('2026-10-20');

    expect(entry.loanId).toBeNull();
    expect(entry.isLoanActive).toBe(false);
    expect(entry.frequency).toBeNull();
    expect(entry.phone).toBe('');
  });

  it('creates a customer and first loan atomically', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          customer_id: 'customer-3',
          loan_id: 'loan-3',
          total_amount: 110,
          base_installment_amount: 36.67,
          last_installment_amount: 36.66,
          first_due_on: '2026-10-17',
        },
      ],
      error: null,
    });

    await expect(
      repository.createClient({
        dni: '82000003',
        fullName: 'Collector New Customer',
        phone: '999888777',
        address: 'Test address',
        notes: 'Created in field',
        principal: 100,
        interestRate: 10,
        frequency: 'daily',
        installmentCount: 3,
        startedOn: '2026-10-17',
      }),
    ).resolves.toEqual({
      customerId: 'customer-3',
      loanId: 'loan-3',
      totalAmount: 110,
      baseInstallmentAmount: 36.67,
      lastInstallmentAmount: 36.66,
      firstDueOn: '2026-10-17',
    });

    expect(rpc).toHaveBeenCalledWith('collector_create_customer_loan', {
      p_document_number: '82000003',
      p_full_name: 'Collector New Customer',
      p_phone: '999888777',
      p_address: 'Test address',
      p_notes: 'Created in field',
      p_principal: 100,
      p_interest_rate: 10,
      p_frequency: 'daily',
      p_installment_count: 3,
      p_started_on: '2026-10-17',
    });
  });

  it.each([
    [
      'Only active collectors may create customers and loans',
      'Solo un cobrador activo puede registrar clientes.',
    ],
    ['Customer document must contain 8 to 12 digits', 'El DNI debe contener entre 8 y 12 dígitos.'],
    ['Customer address is required', 'La dirección es obligatoria.'],
    ['Principal must be greater than zero', 'El capital debe ser mayor que cero.'],
    ['Invalid installment count', 'La cantidad de cuotas no es válida.'],
  ])('translates the creation error %s', async (databaseMessage, expectedMessage) => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '22023', message: databaseMessage },
    });

    const promise = repository.createClient({
      dni: '82000003',
      fullName: 'x',
      phone: '',
      address: '',
      notes: '',
      principal: 0,
      interestRate: 0,
      frequency: 'daily',
      installmentCount: 0,
      startedOn: '2026-10-17',
    });

    await expect(promise).rejects.toMatchObject({
      message: expectedMessage,
    });
  });

  it('translates a duplicate DNI into a validation error', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });

    const promise = repository.createClient({
      dni: '82000003',
      fullName: 'Juan Pérez',
      phone: '',
      address: 'Dirección',
      notes: '',
      principal: 100,
      interestRate: 10,
      frequency: 'daily',
      installmentCount: 3,
      startedOn: '2026-10-17',
    });

    await expect(promise).rejects.toMatchObject({
      code: 'VALIDATION',
      message: 'Ya existe un cliente con ese DNI.',
    });
  });

  it('finds the most recent loan id for a customer', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'loan-9' }, error: null });

    await expect(repository.findLatestLoanId('customer-9')).resolves.toBe('loan-9');
    expect(eq).toHaveBeenCalledWith('customer_id', 'customer-9');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(limit).toHaveBeenCalledWith(1);
  });

  it('returns null when the customer has no loan at all', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(repository.findLatestLoanId('customer-10')).resolves.toBeNull();
  });
});
