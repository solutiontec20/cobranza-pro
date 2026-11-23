import { LoanPaymentRecord, LoanStatus } from '../models/loan.model';
import { roundMoney } from './money';

export interface LoanPaymentSummary {
  paidAmount: number;
  remainingBalance: number;
}

export interface PaymentSelectionSummary {
  selectedCount: number;
  selectedAmount: number;
  remainingPostedCount: number;
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

export function canEditLoan(
  status: LoanStatus,
  payments: ReadonlyArray<Pick<LoanPaymentRecord, 'status'>>,
): boolean {
  return status === 'active' && payments.every((payment) => payment.status !== 'posted');
}

export function summarizePaymentSelection(
  payments: ReadonlyArray<Pick<LoanPaymentRecord, 'id' | 'amount' | 'status'>>,
  selectedIds: ReadonlySet<string>,
): PaymentSelectionSummary {
  let postedCount = 0;
  let selectedCount = 0;
  let selectedAmount = 0;

  for (const payment of payments) {
    if (payment.status !== 'posted') continue;
    postedCount += 1;
    if (!selectedIds.has(payment.id)) continue;
    selectedCount += 1;
    selectedAmount += payment.amount;
  }

  return {
    selectedCount,
    selectedAmount: roundMoney(selectedAmount),
    remainingPostedCount: postedCount - selectedCount,
  };
}
