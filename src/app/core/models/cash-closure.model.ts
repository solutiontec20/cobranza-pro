export type CashClosureStatus = 'draft' | 'submitted' | 'validated';

export type CashExpenseCategory =
  | 'fuel'
  | 'tolls'
  | 'fares'
  | 'parking'
  | 'meals'
  | 'other';

export type CashExpenseStatus = 'pending' | 'approved' | 'rejected';

/**
 * Per collector, per business-date aggregate of `cash_movements`, mirroring
 * `public.collector_cash_day_breakdown`. All amounts are always >= 0; signs
 * are applied by `calculateExpectedCash` (see
 * `core/calculations/cash-closure-calculations.ts`), not here.
 */
export interface CashDayBreakdown {
  collectorId: string;
  businessDate: string;
  openingAmount: number;
  allowanceAmount: number;
  cashCollectedAmount: number;
  yapeCollectedAmount: number;
  plinCollectedAmount: number;
  transferCollectedAmount: number;
  voidedCashAmount: number;
  loanDisbursementAmount: number;
  operatingExpenseAmount: number;
}

export interface CashClosure {
  id: string;
  collectorId: string;
  businessDate: string;
  expectedAmount: number;
  deliveredAmount: number;
  differenceAmount: number;
  status: CashClosureStatus;
  observation: string | null;
  submittedAt: string | null;
  validatedAt: string | null;
  validatedBy: string | null;
}

export interface CashExpense {
  id: string;
  collectorId: string;
  businessDate: string;
  category: CashExpenseCategory;
  amount: number;
  description: string | null;
  status: CashExpenseStatus;
  cashMovementId: string | null;
  requestedBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

/** Full picture of one collector's day: used by both the admin overview and the collector's own screen. */
export interface CollectorCashDay {
  collectorId: string;
  /** Populated by `listDay` (admin overview); left empty by `getOwnDay` (the collector already knows who they are). */
  collectorName: string;
  businessDate: string;
  breakdown: CashDayBreakdown;
  closure: CashClosure | null;
  expenses: CashExpense[];
}

export interface CashCollectorOption {
  id: string;
  fullName: string;
}

export interface RegisterCashOpeningInput {
  collectorId: string;
  businessDate: string;
  amount: number;
  notes: string;
}

export interface RegisterCashAllowanceInput {
  collectorId: string;
  businessDate: string;
  amount: number;
  notes: string;
}

export interface RequestCashExpenseInput {
  /** Omit when the authenticated collector requests their own expense. */
  collectorId?: string;
  businessDate: string;
  category: CashExpenseCategory;
  amount: number;
  description: string;
}

export interface ReviewCashExpenseInput {
  expenseId: string;
  approve: boolean;
  reason: string;
}

export interface SubmitCashClosureInput {
  businessDate: string;
  deliveredAmount: number;
  observation: string;
}

export interface ValidateCashClosureInput {
  closureId: string;
  observation: string;
}
