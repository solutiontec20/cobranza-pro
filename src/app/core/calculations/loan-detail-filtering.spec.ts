import { LoanInstallment, LoanPaymentRecord } from '../models/loan.model';
import { filterInstallments, filterPayments, pageFirst, pageItems } from './loan-detail-filtering';

const installments: LoanInstallment[] = [
  {
    id: 'installment-1',
    loanId: 'loan-1',
    installmentNumber: 1,
    dueDate: '2026-11-05',
    scheduledAmount: 10,
    paidAmount: 10,
    outstandingAmount: 0,
    status: 'paid',
    overdueDays: 0,
  },
  {
    id: 'installment-2',
    loanId: 'loan-1',
    installmentNumber: 2,
    dueDate: '2026-11-06',
    scheduledAmount: 10,
    paidAmount: 4,
    outstandingAmount: 6,
    status: 'partial',
    overdueDays: 0,
  },
];

const payments: LoanPaymentRecord[] = [
  {
    id: 'payment-1',
    amount: 10,
    paymentMethod: 'cash',
    paidAt: '2026-11-05T10:00:00Z',
    businessDate: '2026-11-05',
    status: 'posted',
    notes: null,
    collectorId: 'collector-1',
    collectorName: 'Cobrador Uno',
    voidReason: null,
  },
  {
    id: 'payment-2',
    amount: 4,
    paymentMethod: 'yape',
    paidAt: '2026-11-05T11:00:00Z',
    businessDate: '2026-11-05',
    status: 'voided',
    notes: null,
    collectorId: 'collector-1',
    collectorName: 'Cobrador Uno',
    voidReason: 'Monto incorrecto',
  },
];

describe('loan detail filtering', () => {
  it('filters installments by status without altering the full collection', () => {
    expect(filterInstallments(installments, 'partial')).toEqual([installments[1]]);
    expect(filterInstallments(installments, 'all')).toBe(installments);
  });

  it('combines payment status and method filters', () => {
    expect(filterPayments(payments, 'voided', 'all')).toEqual([payments[1]]);
    expect(filterPayments(payments, 'all', 'cash')).toEqual([payments[0]]);
    expect(filterPayments(payments, 'posted', 'yape')).toEqual([]);
  });

  it('clamps and slices pages when filters reduce the result count', () => {
    const items = Array.from({ length: 23 }, (_, index) => index + 1);
    expect(pageFirst(items.length, 20, 10)).toBe(20);
    expect(pageFirst(4, 20, 10)).toBe(0);
    expect(pageItems(items, 20, 10)).toEqual([21, 22, 23]);
  });
});
