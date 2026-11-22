import { DashboardFinancialGranularity } from '../../../core/models/admin-dashboard.model';

const penFormatter = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });

export function formatFinancialAmount(amount: number): string {
  return penFormatter.format(amount);
}

/** Moves the reference date by one complete visible window. */
export function shiftFinancialReferenceDate(
  referenceDate: string,
  granularity: DashboardFinancialGranularity,
  direction: -1 | 1,
): string {
  const [year, month, day] = referenceDate.split('-').map(Number);

  if (!year || !month || !day) return referenceDate;

  if (granularity === 'weekly') {
    const shifted = new Date(Date.UTC(year, month - 1, day + direction * 84));
    return formatDate(shifted);
  }

  const months = granularity === 'daily' ? 1 : granularity === 'monthly' ? 12 : 60;
  const targetMonth = month - 1 + direction * months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return formatDate(new Date(Date.UTC(targetYear, normalizedMonth, Math.min(day, lastDay))));
}

function formatDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}
