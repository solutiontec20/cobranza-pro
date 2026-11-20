import { InjectionToken } from '@angular/core';
import {
  CashClosure,
  CashAllowanceRequest,
  CashCollectorOption,
  CashExpense,
  CollectorCashDay,
  RegisterCashOpeningInput,
  RequestCashAllowanceInput,
  RequestCashExpenseInput,
  ReviewCashAllowanceRequestInput,
  ReviewCashExpenseInput,
  SubmitCashClosureInput,
  ValidateCashClosureInput,
} from '../models/cash-closure.model';

export interface CashClosureRepository {
  listActiveCollectors(): Promise<CashCollectorOption[]>;

  /** The authenticated collector's own day (collector-side screen). */
  getOwnDay(businessDate: string): Promise<CollectorCashDay>;

  /** Every collector's day for the given date (admin/supervisor overview). */
  listDay(businessDate: string): Promise<CollectorCashDay[]>;

  registerOpening(input: RegisterCashOpeningInput): Promise<void>;
  requestAllowance(input: RequestCashAllowanceInput): Promise<CashAllowanceRequest>;
  reviewAllowanceRequest(input: ReviewCashAllowanceRequestInput): Promise<void>;

  requestExpense(input: RequestCashExpenseInput): Promise<CashExpense>;
  reviewExpense(input: ReviewCashExpenseInput): Promise<void>;

  submitClosure(input: SubmitCashClosureInput): Promise<CashClosure>;
  validateClosure(input: ValidateCashClosureInput): Promise<void>;
}

export const CASH_CLOSURE_REPOSITORY = new InjectionToken<CashClosureRepository>(
  'CASH_CLOSURE_REPOSITORY',
);
