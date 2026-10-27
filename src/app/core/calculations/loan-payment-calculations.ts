import { LoanPaymentRecord } from '../models/loan.model';
import { roundMoney } from './money';

export interface LoanPaymentSummary {
  paidAmount: number;
  remainingBalance: number;
}

export function calculateLoanPaymentSummary(
  totalAmount: number,
  payments: ReadonlyArray<Pick<LoanPaymentRecord, 'amount' | 'status'>>,
): LoanPaymentSummary {
  const paidAmount = roundMoney(
    payments.reduce(
      (total, payment) => total + (payment.status === 'posted' ? payment.amount : 0),
      0,
    ),
  );

  return {
    paidAmount,
    remainingBalance: roundMoney(Math.max(0, totalAmount - paidAmount)),
  };
}
