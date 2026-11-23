import { describe, expect, it } from 'vitest';

import { LoanPaymentRecord, LoanStatus } from '../models/loan.model';
import { canEditLoan, summarizePaymentSelection } from './loan-payment-calculations';

type PaymentState = Pick<LoanPaymentRecord, 'status'>;

const payments = (...statuses: PaymentState['status'][]): PaymentState[] =>
  statuses.map((status) => ({ status }));

describe('canEditLoan', () => {
  it('allows editing an active loan without payments', () => {
    expect(canEditLoan('active', [])).toBe(true);
  });

  it('allows editing an active loan with only voided payment history', () => {
    expect(canEditLoan('active', payments('voided', 'voided'))).toBe(true);
  });

  it('blocks editing while any posted payment remains', () => {
    expect(canEditLoan('active', payments('voided', 'posted'))).toBe(false);
  });

  it.each<LoanStatus>(['paid', 'renewed', 'voided'])(
    'blocks editing a %s loan even without posted payments',
    (status) => {
      expect(canEditLoan(status, payments('voided'))).toBe(false);
    },
  );
});

describe('summarizePaymentSelection', () => {
  it('counts and totals only selected posted payments', () => {
    expect(
      summarizePaymentSelection(
        [
          { id: 'payment-1', amount: 4, status: 'posted' },
          { id: 'payment-2', amount: 2.5, status: 'voided' },
          { id: 'payment-3', amount: 1.25, status: 'posted' },
          { id: 'payment-4', amount: 4, status: 'posted' },
        ],
        new Set(['payment-1', 'payment-2', 'payment-3', 'missing-payment']),
      ),
    ).toEqual({
      selectedCount: 2,
      selectedAmount: 5.25,
      remainingPostedCount: 1,
    });
  });

  it('returns the full posted count when nothing is selected', () => {
    expect(
      summarizePaymentSelection(
        [
          { id: 'payment-1', amount: 4, status: 'posted' },
          { id: 'payment-2', amount: 4, status: 'voided' },
        ],
        new Set(),
      ),
    ).toEqual({
      selectedCount: 0,
      selectedAmount: 0,
      remainingPostedCount: 1,
    });
  });
});
