import { LoanInstallment, LoanInstallmentStatus, LoanPaymentRecord } from '../models/loan.model';

export type InstallmentStatusFilter = LoanInstallmentStatus | 'all';
export type PaymentStatusFilter = LoanPaymentRecord['status'] | 'all';
export type PaymentMethodFilter = string | 'all';

export function filterInstallments(
  installments: LoanInstallment[],
  status: InstallmentStatusFilter,
): LoanInstallment[] {
  return status === 'all'
    ? installments
    : installments.filter((installment) => installment.status === status);
}

export function filterPayments(
  payments: LoanPaymentRecord[],
  status: PaymentStatusFilter,
  method: PaymentMethodFilter,
): LoanPaymentRecord[] {
  return payments.filter(
    (payment) =>
      (status === 'all' || payment.status === status) &&
      (method === 'all' || payment.paymentMethod === method),
  );
}

export function pageFirst(total: number, requestedFirst: number, rows: number): number {
  if (total <= 0 || rows <= 0) return 0;
  return Math.min(Math.max(0, requestedFirst), Math.floor((total - 1) / rows) * rows);
}

export function pageItems<T>(items: T[], first: number, rows: number): T[] {
  const safeFirst = pageFirst(items.length, first, rows);
  return items.slice(safeFirst, safeFirst + rows);
}
