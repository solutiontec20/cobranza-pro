import { formatEsDate } from '../../../core/calculations/date-time';
import { roundMoney } from '../../../core/calculations/money';
import { CashExpenseCategory } from '../../../core/models/cash-closure.model';
import {
  AnalyticsBucket,
  AnalyticsFinancialPoint,
  AnalyticsFinancialTotals,
  AnalyticsPreset,
  AnalyticsRange,
} from '../../../core/models/analytics.model';

const penFormatter = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export const EXPENSE_CATEGORY_LABELS: Record<CashExpenseCategory, string> = {
  fuel: 'Combustible',
  tolls: 'Peajes',
  fares: 'Pasajes',
  parking: 'Estacionamiento',
  meals: 'Alimentación',
  other: 'Otros',
};

export function formatFinancialAmount(amount: number): string {
  return penFormatter.format(amount);
}

/** True only for a real calendar date written as `YYYY-MM-DD` (rejects `2026-02-31`). */
export function isValidDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** A usable custom range: two real dates, end not before start, at most ten years. */
export function isValidRange(start: string, end: string): boolean {
  if (!isValidDate(start) || !isValidDate(end) || end < start) return false;
  return daysBetween(start, end) <= 3660;
}

/** Exact range of a preset around a reference date. `custom` has no derived range. */
export function rangeForPreset(preset: AnalyticsPreset, referenceDate: string): AnalyticsRange {
  if (!isValidDate(referenceDate) || preset === 'custom' || preset === 'day') {
    return { start: referenceDate, end: referenceDate };
  }

  const [year, month, day] = referenceDate.split('-').map(Number);

  if (preset === 'week') {
    const offset = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
    return {
      start: formatDate(new Date(Date.UTC(year, month - 1, day - offset))),
      end: formatDate(new Date(Date.UTC(year, month - 1, day - offset + 6))),
    };
  }

  if (preset === 'month') {
    return {
      start: formatDate(new Date(Date.UTC(year, month - 1, 1))),
      end: formatDate(new Date(Date.UTC(year, month, 0))),
    };
  }

  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/** Size of each point of the evolution charts, chosen from the length of the range. */
export function bucketForRange(range: AnalyticsRange): AnalyticsBucket {
  const days = daysBetween(range.start, range.end) + 1;
  if (days <= 62) return 'day';
  if (days <= 400) return 'week';
  if (days <= 1830) return 'month';
  return 'year';
}

/** Moves a preset's reference date by exactly one day, week, month or year. */
export function shiftReferenceDate(
  referenceDate: string,
  preset: AnalyticsPreset,
  direction: -1 | 1,
): string {
  if (!isValidDate(referenceDate) || preset === 'custom') return referenceDate;

  const [year, month, day] = referenceDate.split('-').map(Number);

  if (preset === 'day') return formatDate(new Date(Date.UTC(year, month - 1, day + direction)));
  if (preset === 'week') {
    return formatDate(new Date(Date.UTC(year, month - 1, day + direction * 7)));
  }

  const months = preset === 'month' ? 1 : 12;
  const targetMonth = month - 1 + direction * months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return formatDate(new Date(Date.UTC(targetYear, normalizedMonth, Math.min(day, lastDay))));
}

/**
 * Adds every flow of the window. All indicators of the series are flows (movements that
 * happened inside each bucket), so adding them is meaningful. Never use this for state
 * indicators such as outstanding balance, which are snapshots at the end of a period.
 */
export function summarizeSeries(
  points: readonly AnalyticsFinancialPoint[],
): AnalyticsFinancialTotals {
  const total = (pick: (point: AnalyticsFinancialPoint) => number) =>
    roundMoney(points.reduce((sum, point) => sum + pick(point), 0));

  return {
    collectedAmount: total((point) => point.collectedAmount),
    interestCollected: total((point) => point.interestCollected),
    loanDisbursements: total((point) => point.loanDisbursements),
    operatingExpenses: total((point) => point.operatingExpenses),
    netProfit: total((point) => point.netProfit),
    paymentsCount: points.reduce((sum, point) => sum + point.paymentsCount, 0),
  };
}

/** True when at least one bucket has any financial movement. */
export function hasFinancialActivity(points: readonly AnalyticsFinancialPoint[]): boolean {
  return points.some(
    (point) =>
      point.collectedAmount !== 0 ||
      point.interestCollected !== 0 ||
      point.loanDisbursements !== 0 ||
      point.operatingExpenses !== 0 ||
      point.netProfit !== 0 ||
      point.paymentsCount !== 0,
  );
}

/** Short label for chart axes. */
export function formatBucketLabel(start: string, end: string, bucket: AnalyticsBucket): string {
  const format = (value: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('es-PE', { ...options, timeZone: 'UTC' }).format(
      new Date(`${value}T00:00:00Z`),
    );

  if (bucket === 'year') return format(start, { year: 'numeric' });
  if (bucket === 'month') return format(start, { month: 'short', year: '2-digit' });
  if (bucket === 'day') return format(start, { day: '2-digit', month: '2-digit' });
  return `${format(start, { day: '2-digit', month: 'short' })}–${format(end, {
    day: '2-digit',
    month: 'short',
  })}`;
}

/** Unambiguous text with the inclusive limits of a bucket or a whole range. */
export function formatRange(start: string, end: string): string {
  if (start === end) return formatEsDate(start, 'short');
  return `${formatEsDate(start, 'short')} – ${formatEsDate(end, 'short')}`;
}

function daysBetween(start: string, end: string): number {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / DAY_MS);
}

function formatDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}
