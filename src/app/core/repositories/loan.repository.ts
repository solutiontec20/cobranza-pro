import { InjectionToken } from '@angular/core';
import {
  CreateLoanInput,
  Loan,
  LoanClientOption,
  LoanInstallment,
  LoanListItem,
  UpdateLoanInput,
} from '../models/loan.model';

export interface LoanRepository {
  list(): Promise<LoanListItem[]>;

  listAvailableClients(): Promise<LoanClientOption[]>;

  getSchedule(loanId: string): Promise<LoanInstallment[]>;

  create(input: CreateLoanInput): Promise<Loan>;

  update(input: UpdateLoanInput): Promise<Loan>;
}

export const LOAN_REPOSITORY = new InjectionToken<LoanRepository>(
  'LOAN_REPOSITORY',
);
