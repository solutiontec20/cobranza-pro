import { describe, expect, it } from 'vitest';

import { firstDueOn } from './loan-calculations';

describe('firstDueOn', () => {
  it('starts a daily Saturday loan on Monday because Sunday is not collectible', () => {
    expect(firstDueOn('2026-10-31', 'daily')).toBe('2026-11-02');
  });

  it('keeps Saturday as a collectible day for a daily Friday loan', () => {
    expect(firstDueOn('2026-10-30', 'daily')).toBe('2026-10-31');
  });

  it('starts a weekly loan seven days after disbursement', () => {
    expect(firstDueOn('2026-10-31', 'weekly')).toBe('2026-11-07');
  });

  it('starts a monthly loan one calendar month later', () => {
    expect(firstDueOn('2026-10-31', 'monthly')).toBe('2026-11-30');
  });

  it('moves a month-end Sunday backward when Monday belongs to the next month', () => {
    expect(firstDueOn('2027-01-31', 'monthly')).toBe('2027-02-27');
  });

  it('preserves invalid input so the form validation can report it', () => {
    expect(firstDueOn('', 'daily')).toBe('');
  });
});
