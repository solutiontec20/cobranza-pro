import { TestBed } from '@angular/core/testing';
import { AppError } from '../../../core/errors/app-error';
import {
  LoanDetail,
  LoanInstallment,
  LoanListItem,
  RegisterLoanPaymentResult,
  RenewLoanResult,
} from '../../../core/models/loan.model';
import { LOAN_REPOSITORY, LoanRepository } from '../../../core/repositories/loan.repository';
import {
  calculateLoanPaymentSummary,
  calculateLoanSummary,
  firstDueOn,
} from './loan-calculations';
import { LoansStore } from './loans.store';

const loan: LoanListItem = {
  id: 'loan-1',
  clientId: 'customer-1',
  clientName: 'Ana Flores',
  clientDni: '45678901',
  collectorId: 'collector-1',
  collectorName: 'María Quispe',
  principal: 100,
  interestRate: 10,
  totalAmount: 110,
  installmentAmount: 36.67,
  installmentCount: 3,
  frequency: 'daily',
  balance: 110,
  status: 'active',
  startedOn: '2026-10-19',
  endDate: '2026-10-21',
  createdAt: '2026-10-19T12:00:00Z',
};

const otherLoan: LoanListItem = {
  ...loan,
  id: 'loan-2',
  clientId: 'customer-2',
  clientName: 'Rosa Vega',
  clientDni: '71234567',
  collectorId: 'collector-2',
  collectorName: 'Luis Ramos',
  frequency: 'monthly',
  status: 'paid',
};

const schedule: LoanInstallment[] = [
  {
    id: 'installment-1',
    loanId: loan.id,
    installmentNumber: 1,
    dueDate: loan.startedOn,
    scheduledAmount: 36.67,
    paidAmount: 0,
    outstandingAmount: 36.67,
    status: 'pending',
    overdueDays: 0,
  },
];

const detail: LoanDetail = {
  loan,
  client: {
    id: loan.clientId,
    dni: '12345678',
    fullName: loan.clientName,
    phone: '987654321',
    address: 'Av. Principal 123',
    notes: 'Cliente puntual',
    collectorId: loan.collectorId,
    collectorName: loan.collectorName,
  },
  installments: schedule,
  payments: [],
};

describe('LoansStore', () => {
  let store: LoansStore;
  let repository: {
    list: ReturnType<typeof vi.fn<LoanRepository['list']>>;
    listAvailableClients: ReturnType<typeof vi.fn<LoanRepository['listAvailableClients']>>;
    getSchedule: ReturnType<typeof vi.fn<LoanRepository['getSchedule']>>;
    getDetail: ReturnType<typeof vi.fn<LoanRepository['getDetail']>>;
    create: ReturnType<typeof vi.fn<LoanRepository['create']>>;
    update: ReturnType<typeof vi.fn<LoanRepository['update']>>;
    registerPayment: ReturnType<typeof vi.fn<LoanRepository['registerPayment']>>;
    renew: ReturnType<typeof vi.fn<LoanRepository['renew']>>;
  };

  beforeEach(() => {
    repository = {
      list: vi.fn<LoanRepository['list']>().mockResolvedValue([loan]),
      listAvailableClients: vi.fn<LoanRepository['listAvailableClients']>().mockResolvedValue([]),
      getSchedule: vi.fn<LoanRepository['getSchedule']>().mockResolvedValue(schedule),
      getDetail: vi.fn<LoanRepository['getDetail']>().mockResolvedValue(detail),
      create: vi.fn<LoanRepository['create']>(),
      update: vi.fn<LoanRepository['update']>(),
      registerPayment: vi.fn<LoanRepository['registerPayment']>(),
      renew: vi.fn<LoanRepository['renew']>(),
    };
    TestBed.configureTestingModule({
      providers: [LoansStore, { provide: LOAN_REPOSITORY, useValue: repository }],
    });
    store = TestBed.inject(LoansStore);
  });

  it('loads loans and eligible clients together', async () => {
    await store.load();
    expect(store.loans()).toEqual([loan]);
    expect(store.availableClients()).toEqual([]);
  });

  it('creates a loan and reloads server state', async () => {
    repository.create.mockResolvedValue({
      id: loan.id,
      clientId: loan.clientId,
      principal: loan.principal,
      interestRate: loan.interestRate,
      totalAmount: loan.totalAmount,
      disbursedAmount: loan.principal,
      installmentCount: loan.installmentCount,
      frequency: loan.frequency,
      startedOn: loan.startedOn,
      firstDueOn: loan.startedOn,
      status: loan.status,
      createdAt: loan.createdAt,
    });

    expect(
      await store.create({
        clientId: loan.clientId,
        principal: loan.principal,
        interestRate: loan.interestRate,
        frequency: loan.frequency,
        installmentCount: loan.installmentCount,
        startedOn: loan.startedOn,
        firstDueOn: loan.startedOn,
      }),
    ).toBe(true);
    expect(repository.list).toHaveBeenCalledOnce();
  });

  it('loads the selected payment schedule', async () => {
    await store.loadSchedule(loan.id);

    expect(repository.getSchedule).toHaveBeenCalledWith(loan.id);
    expect(store.selectedScheduleLoanId()).toBe(loan.id);
    expect(store.selectedSchedule()).toEqual(schedule);
    expect(store.loadingSchedule()).toBe(false);
  });

  it('loads the complete routed loan detail', async () => {
    await store.loadDetail(loan.id);

    expect(repository.getDetail).toHaveBeenCalledWith(loan.id);
    expect(store.selectedDetail()).toEqual(detail);
    expect(store.loadingDetail()).toBe(false);
  });

  it('updates a loan and reloads its list and selected schedule', async () => {
    repository.update.mockResolvedValue({
      id: loan.id,
      clientId: loan.clientId,
      principal: 120,
      interestRate: loan.interestRate,
      totalAmount: 132,
      disbursedAmount: 120,
      installmentCount: 4,
      frequency: loan.frequency,
      startedOn: loan.startedOn,
      firstDueOn: loan.startedOn,
      status: loan.status,
      createdAt: loan.createdAt,
    });
    await store.loadSchedule(loan.id);
    repository.getSchedule.mockClear();

    const updated = await store.update({
      loanId: loan.id,
      principal: 120,
      interestRate: loan.interestRate,
      frequency: loan.frequency,
      installmentCount: 4,
      startedOn: loan.startedOn,
      reason: 'Corregir datos del contrato',
    });

    expect(updated).toBe(true);
    expect(repository.list).toHaveBeenCalledOnce();
    expect(repository.getSchedule).toHaveBeenCalledWith(loan.id);
    expect(store.saving()).toBe(false);
  });

  it('exposes repository errors without replacing the current loan list', async () => {
    await store.load();
    repository.update.mockRejectedValue(
      new AppError('VALIDATION', 'Solo se pueden editar préstamos activos.'),
    );

    const updated = await store.update({
      loanId: loan.id,
      principal: loan.principal,
      interestRate: loan.interestRate,
      frequency: loan.frequency,
      installmentCount: loan.installmentCount,
      startedOn: loan.startedOn,
      reason: 'Corregir datos del contrato',
    });

    expect(updated).toBe(false);
    expect(store.error()).toBe('Solo se pueden editar préstamos activos.');
    expect(store.loans()).toEqual([loan]);
    expect(repository.list).toHaveBeenCalledOnce();
  });

  it('registers a payment and refreshes the complete server state', async () => {
    const paymentResult: RegisterLoanPaymentResult = {
      paymentId: 'payment-1',
      allocatedAmount: 36.67,
      remainingBalance: 73.33,
      resultingLoanStatus: 'active',
    };
    repository.registerPayment.mockResolvedValue(paymentResult);

    await expect(
      store.registerPayment({
        loanId: loan.id,
        amount: 36.67,
        paymentMethod: 'cash',
        notes: 'Pago en oficina',
      }),
    ).resolves.toEqual(paymentResult);

    expect(repository.registerPayment).toHaveBeenCalledWith({
      loanId: loan.id,
      amount: 36.67,
      paymentMethod: 'cash',
      notes: 'Pago en oficina',
    });
    expect(repository.list).toHaveBeenCalledOnce();
    expect(repository.listAvailableClients).toHaveBeenCalledOnce();
    expect(repository.getDetail).toHaveBeenCalledWith(loan.id);
    expect(store.paying()).toBe(false);
  });

  it('keeps a committed payment result when the subsequent refresh fails', async () => {
    const paymentResult: RegisterLoanPaymentResult = {
      paymentId: 'payment-1',
      allocatedAmount: 36.67,
      remainingBalance: 73.33,
      resultingLoanStatus: 'active',
    };
    repository.registerPayment.mockResolvedValue(paymentResult);
    repository.getDetail.mockRejectedValue(new AppError('SUPABASE_RPC', 'Sin conexión'));

    await expect(
      store.registerPayment({
        loanId: loan.id,
        amount: 36.67,
        paymentMethod: 'cash',
        notes: '',
      }),
    ).resolves.toEqual(paymentResult);

    expect(store.error()).toContain('El pago se registró');
  });

  it('renews a loan and refreshes the complete server state with the new loan id', async () => {
    const renewResult: RenewLoanResult = {
      loanId: 'loan-2',
      clientId: loan.clientId,
      previousLoanId: loan.id,
      totalAmount: 110,
      disbursedAmount: 26.67,
      baseInstallmentAmount: 36.67,
      lastInstallmentAmount: 36.66,
      firstDueOn: '2026-10-27',
    };
    repository.renew.mockResolvedValue(renewResult);

    await expect(
      store.renew({
        loanId: loan.id,
        principal: 100,
        interestRate: 10,
        frequency: 'daily',
        installmentCount: 3,
        startedOn: '2026-10-27',
      }),
    ).resolves.toEqual(renewResult);

    expect(repository.list).toHaveBeenCalledOnce();
    expect(repository.listAvailableClients).toHaveBeenCalledOnce();
    expect(repository.getDetail).toHaveBeenCalledWith('loan-2');
    expect(store.renewing()).toBe(false);
  });

  it('sets an error message when the renewal fails', async () => {
    repository.renew.mockRejectedValue(
      new AppError('VALIDATION', 'El cliente es moroso (más de 5 días de atraso) y no puede renovar su préstamo.'),
    );

    const result = await store.renew({
      loanId: loan.id,
      principal: 100,
      interestRate: 10,
      frequency: 'daily',
      installmentCount: 3,
      startedOn: '2026-10-27',
    });

    expect(result).toBeNull();
    expect(store.error()).toBe(
      'El cliente es moroso (más de 5 días de atraso) y no puede renovar su préstamo.',
    );
  });

  describe('filtering', () => {
    beforeEach(() => {
      repository.list.mockResolvedValue([loan, otherLoan]);
    });

    it('filters by free-text search across client name, DNI and collector name, ignoring accents', async () => {
      await store.load();

      store.query.set('ana');
      expect(store.filteredLoans()).toEqual([loan]);

      store.query.set('71234567');
      expect(store.filteredLoans()).toEqual([otherLoan]);

      store.query.set('ramos');
      expect(store.filteredLoans()).toEqual([otherLoan]);

      store.query.set('ningún cliente');
      expect(store.filteredLoans()).toEqual([]);
    });

    it('filters by status', async () => {
      await store.load();
      store.statusFilter.set('paid');
      expect(store.filteredLoans()).toEqual([otherLoan]);
    });

    it('filters by collector', async () => {
      await store.load();
      store.collectorFilter.set('collector-1');
      expect(store.filteredLoans()).toEqual([loan]);
    });

    it('filters by frequency', async () => {
      await store.load();
      store.frequencyFilter.set('monthly');
      expect(store.filteredLoans()).toEqual([otherLoan]);
    });

    it('combines every active filter', async () => {
      await store.load();
      store.statusFilter.set('active');
      store.collectorFilter.set('collector-2');
      expect(store.filteredLoans()).toEqual([]);
    });

    it('exposes the distinct collectors present in the loaded loans, sorted by name', async () => {
      await store.load();
      expect(store.collectorOptions()).toEqual([
        { id: 'collector-2', fullName: 'Luis Ramos' },
        { id: 'collector-1', fullName: 'María Quispe' },
      ]);
    });

    it('clears every filter back to its default', async () => {
      await store.load();
      store.query.set('ana');
      store.statusFilter.set('paid');
      store.collectorFilter.set('collector-2');
      store.frequencyFilter.set('monthly');

      store.clearFilters();

      expect(store.query()).toBe('');
      expect(store.statusFilter()).toBe('all');
      expect(store.collectorFilter()).toBeNull();
      expect(store.frequencyFilter()).toBe('all');
      expect(store.filteredLoans()).toEqual([loan, otherLoan]);
    });
  });
});

describe('loan calculations', () => {
  it('subtracts every posted same-day payment from the remaining loan balance', () => {
    const payments = Array.from({ length: 7 }, () => ({
      amount: 4,
      status: 'posted' as const,
    }));

    expect(calculateLoanPaymentSummary(120, payments)).toEqual({
      paidAmount: 28,
      remainingBalance: 92,
    });
  });

  it('excludes voided payments from the paid and remaining amounts', () => {
    expect(
      calculateLoanPaymentSummary(120, [
        { amount: 4, status: 'posted' },
        { amount: 4, status: 'voided' },
      ]),
    ).toEqual({
      paidAmount: 4,
      remainingBalance: 116,
    });
  });

  it('keeps the rounding difference in the last installment', () => {
    expect(calculateLoanSummary(100, 10, 3)).toEqual({
      totalAmount: 110,
      baseInstallmentAmount: 36.67,
      lastInstallmentAmount: 36.66,
    });
  });

  it('keeps Saturday and moves Sunday to Monday for daily collections', () => {
    expect(firstDueOn('2026-10-17', 'daily')).toBe('2026-10-17');
    expect(firstDueOn('2026-10-18', 'daily')).toBe('2026-10-19');
  });
});
