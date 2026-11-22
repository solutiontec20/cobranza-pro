import { formatFinancialAmount, shiftFinancialReferenceDate } from './financial-chart-calculations';

describe('shiftFinancialReferenceDate', () => {
  it('moves daily views by one month while preserving the selected day when possible', () => {
    expect(shiftFinancialReferenceDate('2026-01-31', 'daily', 1)).toBe('2026-02-28');
    expect(shiftFinancialReferenceDate('2026-01-31', 'daily', -1)).toBe('2025-12-31');
  });

  it('moves weekly views by twelve weeks and monthly views by twelve months', () => {
    expect(shiftFinancialReferenceDate('2026-11-22', 'weekly', 1)).toBe('2027-02-14');
    expect(shiftFinancialReferenceDate('2026-11-22', 'monthly', -1)).toBe('2025-11-22');
  });

  it('moves annual views by five years and clamps leap days', () => {
    expect(shiftFinancialReferenceDate('2024-02-29', 'annual', 1)).toBe('2029-02-28');
  });
});

it('formats chart values as Peruvian soles', () => {
  expect(formatFinancialAmount(20)).toContain('20.00');
  expect(formatFinancialAmount(20)).toContain('S/');
});
