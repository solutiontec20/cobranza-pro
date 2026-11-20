import { LoanFrequency } from '../models/loan.model';
import { roundMoney } from './money';

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
  const date = new Date(`${startedOn}T00:00:00`);
  if (Number.isNaN(date.getTime())) return startedOn;

  if (frequency === 'daily') {
    date.setDate(date.getDate() + 1);
    while (date.getDay() === 0) {
      date.setDate(date.getDate() + 1);
    }
  } else if (frequency === 'weekly') {
    date.setDate(date.getDate() + 7);
  } else {
    const installmentDay = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + 1);
    const targetMonth = date.getMonth();
    const lastDayOfTargetMonth = new Date(date.getFullYear(), targetMonth + 1, 0).getDate();
    date.setDate(Math.min(installmentDay, lastDayOfTargetMonth));

    if (date.getDay() === 0) {
      date.setDate(date.getDate() + 1);
      if (date.getMonth() !== targetMonth) {
        date.setDate(date.getDate() - 2);
      }
    }
  }

  return toDateInput(date);
}

export function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
