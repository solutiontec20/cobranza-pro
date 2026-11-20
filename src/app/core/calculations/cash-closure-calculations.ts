import { CashDayBreakdown } from '../models/cash-closure.model';
import { roundMoney } from './money';

export function emptyCashDayBreakdown(collectorId: string, businessDate: string): CashDayBreakdown {
  return {
    collectorId,
    businessDate,
    openingAmount: 0,
    allowanceAmount: 0,
    cashCollectedAmount: 0,
    yapeCollectedAmount: 0,
    plinCollectedAmount: 0,
    transferCollectedAmount: 0,
    voidedCashAmount: 0,
    loanDisbursementAmount: 0,
    operatingExpenseAmount: 0,
  };
}

/**
 * Expected cash = opening + allowances + cash collections
 *   - voided cash collections - cash loan disbursements - approved cash operating expenses.
 *
 * Mirrors `private.collector_expected_cash` in
 * `supabase/migrations/20261025130000_cash_closure_operations.sql` exactly — keep both in sync.
 * Digital collections (yape/plin/transfer) never touch the physical cash the collector must
 * deliver, so they are deliberately excluded here.
 */
export function calculateExpectedCash(breakdown: CashDayBreakdown): number {
  return roundMoney(
    breakdown.openingAmount +
      breakdown.allowanceAmount +
      breakdown.cashCollectedAmount -
      breakdown.voidedCashAmount -
      breakdown.loanDisbursementAmount -
      breakdown.operatingExpenseAmount,
  );
}

export function calculateTotalCollected(breakdown: CashDayBreakdown): number {
  return roundMoney(
    breakdown.cashCollectedAmount +
      breakdown.yapeCollectedAmount +
      breakdown.plinCollectedAmount +
      breakdown.transferCollectedAmount,
  );
}
