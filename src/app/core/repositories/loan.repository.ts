import { InjectionToken } from '@angular/core';
import {
  CreateLoanInput,
  Loan,
  LoanClientOption,
  LoanListItem,
} from '../models/loan.model';

export interface LoanRepository {
  list(): Promise<LoanListItem[]>;

  listAvailableClients(): Promise<LoanClientOption[]>;

  create(input: CreateLoanInput): Promise<Loan>;
}

export const LOAN_REPOSITORY = new InjectionToken<LoanRepository>(
  'LOAN_REPOSITORY',
);
