import { TestBed } from '@angular/core/testing';
import {
  LoanDetail,
  RegisterLoanPaymentResult,
  RenewLoanResult,
} from '../../../core/models/loan.model';
import { LOAN_REPOSITORY, LoanRepository } from '../../../core/repositories/loan.repository';
import { CollectorLoanStore } from './collector-loan.store';

const detail: LoanDetail = {
  loan: {
    id: 'loan-1',
    clientId: 'customer-1',
    clientName: 'Juan Pérez',
    collectorId: 'collector-1',
    collectorName: 'Pedro Castillo',
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
  },
  client: {
    id: 'customer-1',
    dni: '12345678',
    fullName: 'Juan Pérez',
    phone: '987654321',
    address: 'Av. Principal 123',
    notes: null,
    collectorId: 'collector-1',
    collectorName: 'Pedro Castillo',
  },
  installments: [],
  payments: [],
};

describe('CollectorLoanStore', () => {
  let store: CollectorLoanStore;
  let repository: {
    getDetail: ReturnType<typeof vi.fn<LoanRepository['getDetail']>>;
    registerPayment: ReturnType<typeof vi.fn<LoanRepository['registerPayment']>>;
    renew: ReturnType<typeof vi.fn<LoanRepository['renew']>>;
  };

  beforeEach(() => {
    repository = {
      getDetail: vi.fn<LoanRepository['getDetail']>().mockResolvedValue(detail),
      registerPayment: vi.fn<LoanRepository['registerPayment']>(),
      renew: vi.fn<LoanRepository['renew']>(),
    };
    TestBed.configureTestingModule({
      providers: [CollectorLoanStore, { provide: LOAN_REPOSITORY, useValue: repository }],
    });
    store = TestBed.inject(CollectorLoanStore);
  });

  it('does not expose update/void methods, only load + register payment', () => {
    expect((store as unknown as { update?: unknown }).update).toBeUndefined();
    expect((store as unknown as { voidPayment?: unknown }).voidPayment).toBeUndefined();
  });

  it('loads the loan detail', async () => {
    await store.loadDetail('loan-1');
    expect(store.detail()).toEqual(detail);
    expect(repository.getDetail).toHaveBeenCalledWith('loan-1');
  });

  it('sets an error message when loading detail fails', async () => {
    repository.getDetail.mockRejectedValue(new Error('boom'));
    await store.loadDetail('loan-1');
    expect(store.detail()).toBeNull();
    expect(store.error()).toBe('boom');
  });

  it('registers a payment and refreshes the detail', async () => {
    const result: RegisterLoanPaymentResult = {
      paymentId: 'payment-1',
      allocatedAmount: 36.67,
      remainingBalance: 73.33,
      resultingLoanStatus: 'active',
    };
    repository.registerPayment.mockResolvedValue(result);

    const returned = await store.registerPayment({
      loanId: 'loan-1',
      amount: 36.67,
      paymentMethod: 'cash',
      notes: '',
    });

    expect(returned).toEqual(result);
    expect(repository.getDetail).toHaveBeenCalledWith('loan-1');
  });

  it('sets an error message when the payment registration fails', async () => {
    repository.registerPayment.mockRejectedValue(new Error('El monto no puede superar el saldo pendiente.'));

    const returned = await store.registerPayment({
      loanId: 'loan-1',
      amount: 1000,
      paymentMethod: 'cash',
      notes: '',
    });

    expect(returned).toBeNull();
    expect(store.error()).toBe('El monto no puede superar el saldo pendiente.');
  });

  it('renews a loan and refreshes the detail with the new loan id', async () => {
    const result: RenewLoanResult = {
      loanId: 'loan-2',
      clientId: 'customer-1',
      previousLoanId: 'loan-1',
      totalAmount: 110,
      disbursedAmount: 26.67,
      baseInstallmentAmount: 36.67,
      lastInstallmentAmount: 36.66,
      firstDueOn: '2026-10-27',
    };
    repository.renew.mockResolvedValue(result);

    const returned = await store.renew({
      loanId: 'loan-1',
      principal: 100,
      interestRate: 10,
      frequency: 'daily',
      installmentCount: 3,
      startedOn: '2026-10-27',
    });

    expect(returned).toEqual(result);
    expect(repository.getDetail).toHaveBeenCalledWith('loan-2');
  });

  it('sets an error message when the renewal fails', async () => {
    repository.renew.mockRejectedValue(
      new Error('El cliente es moroso (más de 5 días de atraso) y no puede renovar su préstamo.'),
    );

    const returned = await store.renew({
      loanId: 'loan-1',
      principal: 100,
      interestRate: 10,
      frequency: 'daily',
      installmentCount: 3,
      startedOn: '2026-10-27',
    });

    expect(returned).toBeNull();
    expect(store.error()).toBe(
      'El cliente es moroso (más de 5 días de atraso) y no puede renovar su préstamo.',
    );
  });
});
