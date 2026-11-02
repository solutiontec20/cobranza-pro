import { TestBed } from '@angular/core/testing';
import { CorrectionRequest } from '../../core/models/correction-request.model';
import {
  CORRECTION_REQUEST_REPOSITORY,
  CorrectionRequestRepository,
} from '../../core/repositories/correction-request.repository';
import { CorrectionRequestsStore } from './correction-requests.store';

const request: CorrectionRequest = {
  id: 'request-1',
  requestType: 'void_payment',
  status: 'pending',
  loanId: 'loan-1',
  paymentId: 'payment-1',
  requestedBy: 'collector-1',
  reason: 'El importe no coincide con lo cobrado.',
  proposedChanges: null,
  handledBy: null,
  handledAt: null,
  resolutionNote: null,
  createdAt: '2026-10-31T12:00:00Z',
  customerId: 'customer-1',
  customerName: 'Cliente Uno',
  customerDocument: '12345678',
  collectorId: 'collector-1',
  collectorName: 'Cobrador Uno',
  loanStatus: 'active',
  loanFrequency: 'daily',
  loanStartedOn: '2026-10-31',
  loanPrincipal: 100,
  loanInterestRate: 20,
  loanInstallmentCount: 30,
  loanTotal: 120,
  paymentAmount: 4,
  paymentDate: '2026-11-02',
  paymentStatus: 'posted',
  paymentMethod: 'cash',
};

describe('CorrectionRequestsStore', () => {
  let store: CorrectionRequestsStore;
  let repository: {
    [K in keyof CorrectionRequestRepository]: ReturnType<
      typeof vi.fn<CorrectionRequestRepository[K]>
    >;
  };

  beforeEach(() => {
    repository = {
      list: vi.fn<CorrectionRequestRepository['list']>().mockResolvedValue([request]),
      countPending: vi.fn<CorrectionRequestRepository['countPending']>().mockResolvedValue(1),
      create: vi.fn<CorrectionRequestRepository['create']>().mockResolvedValue({
        requestId: 'request-1',
        requestType: 'void_payment',
        requestStatus: 'pending',
        createdAt: '2026-10-31T12:00:00Z',
      }),
      reject: vi.fn<CorrectionRequestRepository['reject']>().mockResolvedValue({
        requestId: 'request-1',
        requestStatus: 'rejected',
        handledAt: '2026-10-31T13:00:00Z',
      }),
      resolveEdit: vi.fn<CorrectionRequestRepository['resolveEdit']>(),
      resolveVoidLoan: vi.fn<CorrectionRequestRepository['resolveVoidLoan']>(),
      resolveVoidPayment: vi
        .fn<CorrectionRequestRepository['resolveVoidPayment']>()
        .mockResolvedValue({
          requestId: 'request-1',
          requestStatus: 'resolved',
          handledAt: '2026-10-31T13:00:00Z',
        }),
    };

    TestBed.configureTestingModule({
      providers: [
        CorrectionRequestsStore,
        { provide: CORRECTION_REQUEST_REPOSITORY, useValue: repository },
      ],
    });
    store = TestBed.inject(CorrectionRequestsStore);
  });

  it('loads requests and the pending count', async () => {
    await Promise.all([store.load('pending', 20), store.refreshPendingCount()]);

    expect(repository.list).toHaveBeenCalledWith('pending', 20);
    expect(store.requests()).toEqual([request]);
    expect(store.pendingCount()).toBe(1);
  });

  it('creates a collector request without calling reviewer-only list endpoints', async () => {
    const receipt = await store.create({
      requestType: 'void_payment',
      loanId: 'loan-1',
      paymentId: 'payment-1',
      reason: 'El importe no coincide.',
    });

    expect(receipt?.requestId).toBe('request-1');
    expect(repository.list).not.toHaveBeenCalled();
    expect(repository.countPending).not.toHaveBeenCalled();
  });

  it('resolves payment voiding and refreshes the inbox', async () => {
    const resolved = await store.resolveVoidPayment({
      requestId: 'request-1',
      resolutionNote: 'Pago duplicado confirmado.',
    });

    expect(resolved).toBe(true);
    expect(repository.resolveVoidPayment).toHaveBeenCalledWith({
      requestId: 'request-1',
      resolutionNote: 'Pago duplicado confirmado.',
    });
    expect(store.error()).toBeNull();
  });

  it('keeps a user-facing error when a mutation fails', async () => {
    repository.reject.mockRejectedValue(new Error('Solicitud ya procesada'));

    expect(await store.reject({ requestId: 'request-1', resolutionNote: 'No corresponde.' })).toBe(
      false,
    );
    expect(store.error()).toBe('Solicitud ya procesada');
  });
});
