import { AnalyticsFinancialPoint } from '../../../core/models/analytics.model';
import {
  bucketForRange,
  formatBucketLabel,
  formatFinancialAmount,
  formatRange,
  hasFinancialActivity,
  isValidDate,
  isValidRange,
  rangeForPreset,
  shiftReferenceDate,
  summarizeSeries,
} from './analytics-calculations';

function point(overrides: Partial<AnalyticsFinancialPoint> = {}): AnalyticsFinancialPoint {
  return {
    bucketStart: '2026-11-01',
    bucketEnd: '2026-11-01',
    collectedAmount: 0,
    interestCollected: 0,
    loanDisbursements: 0,
    operatingExpenses: 0,
    netProfit: 0,
    paymentsCount: 0,
    ...overrides,
  };
}

describe('rangeForPreset', () => {
  // 2026-11-22 is a Sunday.
  it('a day is exactly that day, not the whole month', () => {
    expect(rangeForPreset('day', '2026-11-22')).toEqual({ start: '2026-11-22', end: '2026-11-22' });
  });

  it('a week runs Monday to Sunday around the reference date', () => {
    expect(rangeForPreset('week', '2026-11-22')).toEqual({
      start: '2026-11-16',
      end: '2026-11-22',
    });
    expect(rangeForPreset('week', '2026-11-16')).toEqual({
      start: '2026-11-16',
      end: '2026-11-22',
    });
    expect(rangeForPreset('week', '2026-11-18')).toEqual({
      start: '2026-11-16',
      end: '2026-11-22',
    });
  });

  it('a week can cross a month and a year boundary', () => {
    expect(rangeForPreset('week', '2026-12-31')).toEqual({
      start: '2026-12-28',
      end: '2027-01-03',
    });
  });

  it('a month is the whole calendar month, including leap Februaries', () => {
    expect(rangeForPreset('month', '2026-11-22')).toEqual({
      start: '2026-11-01',
      end: '2026-11-30',
    });
    expect(rangeForPreset('month', '2028-02-10')).toEqual({
      start: '2028-02-01',
      end: '2028-02-29',
    });
    expect(rangeForPreset('month', '2026-02-10')).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    });
  });

  it('a year is the whole calendar year', () => {
    expect(rangeForPreset('year', '2026-11-22')).toEqual({
      start: '2026-01-01',
      end: '2026-12-31',
    });
  });
});

describe('bucketForRange', () => {
  it('uses daily points for up to about two months', () => {
    expect(bucketForRange({ start: '2026-11-22', end: '2026-11-22' })).toBe('day');
    expect(bucketForRange({ start: '2026-11-01', end: '2026-11-30' })).toBe('day');
    expect(bucketForRange({ start: '2026-01-01', end: '2026-03-03' })).toBe('day'); // 62 days
  });

  it('switches to weekly, monthly and yearly points as the range grows', () => {
    expect(bucketForRange({ start: '2026-01-01', end: '2026-03-04' })).toBe('week'); // 63 days
    expect(bucketForRange({ start: '2026-01-01', end: '2026-12-31' })).toBe('week');
    expect(bucketForRange({ start: '2026-01-01', end: '2027-12-31' })).toBe('month');
    expect(bucketForRange({ start: '2026-01-01', end: '2031-12-31' })).toBe('year');
  });
});

describe('shiftReferenceDate', () => {
  it('moves one day, crossing month boundaries', () => {
    expect(shiftReferenceDate('2026-12-01', 'day', -1)).toBe('2026-11-30');
    expect(shiftReferenceDate('2026-11-30', 'day', 1)).toBe('2026-12-01');
  });

  it('moves one week at a time', () => {
    expect(shiftReferenceDate('2026-11-22', 'week', -1)).toBe('2026-11-15');
    expect(shiftReferenceDate('2026-12-28', 'week', 1)).toBe('2027-01-04');
  });

  it('moves one month and clamps to the last day of shorter months', () => {
    expect(shiftReferenceDate('2026-01-31', 'month', 1)).toBe('2026-02-28');
    expect(shiftReferenceDate('2026-01-31', 'month', -1)).toBe('2025-12-31');
  });

  it('moves one year and clamps leap days', () => {
    expect(shiftReferenceDate('2028-02-29', 'year', 1)).toBe('2029-02-28');
    expect(shiftReferenceDate('2026-11-22', 'year', -1)).toBe('2025-11-22');
  });

  it('leaves a custom preset or an invalid date untouched', () => {
    expect(shiftReferenceDate('2026-11-22', 'custom', 1)).toBe('2026-11-22');
    expect(shiftReferenceDate('2026-02-31', 'day', 1)).toBe('2026-02-31');
  });
});

describe('date validation', () => {
  it('accepts real calendar dates, including leap days', () => {
    expect(isValidDate('2026-11-22')).toBe(true);
    expect(isValidDate('2028-02-29')).toBe(true);
  });

  it('rejects malformed values and dates that do not exist', () => {
    for (const value of ['', '22/11/2026', '2026-13-01', '2026-02-29', '2026-04-31']) {
      expect(isValidDate(value)).toBe(false);
    }
  });

  it('accepts a range with end on or after start, up to ten years', () => {
    expect(isValidRange('2026-11-01', '2026-11-01')).toBe(true);
    expect(isValidRange('2026-11-01', '2026-11-30')).toBe(true);
    expect(isValidRange('2020-01-01', '2029-12-31')).toBe(true);
  });

  it('rejects an inverted, impossible or oversized range', () => {
    expect(isValidRange('2026-11-10', '2026-11-09')).toBe(false);
    expect(isValidRange('2026-02-30', '2026-03-01')).toBe(false);
    expect(isValidRange('2010-01-01', '2026-11-30')).toBe(false);
  });
});

describe('summarizeSeries', () => {
  it('adds every flow of the window and rounds to cents', () => {
    const totals = summarizeSeries([
      point({ collectedAmount: 100.1, interestCollected: 20.1, netProfit: 15.1, paymentsCount: 2 }),
      point({
        bucketStart: '2026-11-02',
        bucketEnd: '2026-11-02',
        collectedAmount: 0.2,
        interestCollected: 0.2,
        loanDisbursements: -50,
        operatingExpenses: 5,
        netProfit: -4.8,
        paymentsCount: 1,
      }),
    ]);

    expect(totals).toEqual({
      collectedAmount: 100.3,
      interestCollected: 20.3,
      loanDisbursements: -50,
      operatingExpenses: 5,
      netProfit: 10.3,
      paymentsCount: 3,
    });
  });

  it('returns zero totals for an empty series', () => {
    expect(summarizeSeries([])).toEqual({
      collectedAmount: 0,
      interestCollected: 0,
      loanDisbursements: 0,
      operatingExpenses: 0,
      netProfit: 0,
      paymentsCount: 0,
    });
  });
});

describe('hasFinancialActivity', () => {
  it('is false when every bucket is zero', () => {
    expect(hasFinancialActivity([point(), point({ bucketStart: '2026-11-02' })])).toBe(false);
    expect(hasFinancialActivity([])).toBe(false);
  });

  it('is true as soon as one bucket has a movement, including a reversal', () => {
    expect(hasFinancialActivity([point(), point({ loanDisbursements: -50 })])).toBe(true);
    expect(hasFinancialActivity([point({ paymentsCount: 1 })])).toBe(true);
  });
});

describe('labels', () => {
  it('uses compact axis labels per bucket size', () => {
    expect(formatBucketLabel('2026-11-22', '2026-11-22', 'day')).toBe('22/11');
    expect(formatBucketLabel('2026-01-01', '2026-12-31', 'year')).toBe('2026');
    expect(formatBucketLabel('2026-11-01', '2026-11-30', 'month')).toContain('26');
    expect(formatBucketLabel('2026-11-09', '2026-11-15', 'week')).toContain('–');
  });

  it('shows both inclusive limits for a range and a single date for a day', () => {
    expect(formatRange('2026-11-22', '2026-11-22')).toBe('22/11/2026');
    expect(formatRange('2026-11-16', '2026-11-22')).toBe('16/11/2026 – 22/11/2026');
  });

  it('formats amounts as Peruvian soles', () => {
    expect(formatFinancialAmount(20)).toContain('20.00');
    expect(formatFinancialAmount(20)).toContain('S/');
  });
});
