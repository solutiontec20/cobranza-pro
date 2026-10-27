import { InjectionToken } from '@angular/core';
import {
  CreateLoanInput,
  Loan,
  LoanClientOption,
  LoanDetail,
  LoanInstallment,
  LoanListItem,
  RegisterLoanPaymentInput,
  RegisterLoanPaymentResult,
  RenewLoanInput,
  RenewLoanResult,
  UpdateLoanInput,
} from '../models/loan.model';

export interface LoanRepository {
  list(): Promise<LoanListItem[]>;

  listAvailableClients(): Promise<LoanClientOption[]>;

  getSchedule(loanId: string): Promise<LoanInstallment[]>;

  getDetail(loanId: string): Promise<LoanDetail>;

  create(input: CreateLoanInput): Promise<Loan>;

  update(input: UpdateLoanInput): Promise<Loan>;

  registerPayment(input: RegisterLoanPaymentInput): Promise<RegisterLoanPaymentResult>;

  renew(input: RenewLoanInput): Promise<RenewLoanResult>;
}

export const LOAN_REPOSITORY = new InjectionToken<LoanRepository>(
  'LOAN_REPOSITORY',
);
