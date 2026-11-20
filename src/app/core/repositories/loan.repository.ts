import { InjectionToken } from '@angular/core';
import {
  CreateLoanInput,
  Loan,
  LoanClientOption,
  LoanCollectorOption,
  LoanDetail,
  LoanInstallment,
  LoanListPage,
  LoanListQuery,
  RegisterLoanPaymentInput,
  RegisterLoanPaymentResult,
  RenewLoanInput,
  RenewLoanResult,
  UpdateLoanInput,
  VoidLoanPaymentInput,
  VoidLoanPaymentResult,
} from '../models/loan.model';

export interface LoanRepository {
  listPage(query: LoanListQuery): Promise<LoanListPage>;

  listAvailableClients(): Promise<LoanClientOption[]>;

  listCollectorOptions(): Promise<LoanCollectorOption[]>;

  getSchedule(loanId: string): Promise<LoanInstallment[]>;

  getDetail(loanId: string): Promise<LoanDetail>;

  create(input: CreateLoanInput): Promise<Loan>;

  update(input: UpdateLoanInput): Promise<Loan>;

  registerPayment(input: RegisterLoanPaymentInput): Promise<RegisterLoanPaymentResult>;

  voidPayment(input: VoidLoanPaymentInput): Promise<VoidLoanPaymentResult>;

  renew(input: RenewLoanInput): Promise<RenewLoanResult>;
}

export const LOAN_REPOSITORY = new InjectionToken<LoanRepository>('LOAN_REPOSITORY');
