import { LoanFrequency } from '../../../core/models/loan.model';

export { calculateLoanPaymentSummary } from '../../../core/calculations/loan-payment-calculations';
export type { LoanPaymentSummary } from '../../../core/calculations/loan-payment-calculations';

export interface LoanSummary {
  totalAmount: number;
  baseInstallmentAmount: number;
  lastInstallmentAmount: number;
}

export function calculateLoanSummary(
  principal: number,
  interestRate: number,
  installmentCount: number,
): LoanSummary {
  if (principal <= 0 || interestRate < 0 || installmentCount <= 0) {
    return { totalAmount: 0, baseInstallmentAmount: 0, lastInstallmentAmount: 0 };
  }

  const totalAmount = roundMoney(principal + (principal * interestRate) / 100);
  const baseInstallmentAmount = roundMoney(totalAmount / installmentCount);
  const lastInstallmentAmount = roundMoney(
    totalAmount - baseInstallmentAmount * (installmentCount - 1),
  );

  return { totalAmount, baseInstallmentAmount, lastInstallmentAmount };
}

export function firstDueOn(startedOn: string, frequency: LoanFrequency): string {
  if (frequency !== 'daily') return startedOn;

  const date = new Date(`${startedOn}T00:00:00`);
  if (Number.isNaN(date.getTime())) return startedOn;

  while (date.getDay() === 0) {
    date.setDate(date.getDate() + 1);
  }

  return toDateInput(date);
}

export function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
