import { FrequencyType, LoanStatus } from './profile.model';

export interface Loan {
  id: string;
  clientId: string;
  collectorId: string;
  principal: number;
  interestRate: number;
  interestAmount: number;
  totalAmount: number;
  installmentAmount: number;
  frequency: FrequencyType;
  numberOfInstallments: number;
  startDate: string;
  endDate: string;
  balance: number;
  status: LoanStatus;
  createdAt: string;
}
