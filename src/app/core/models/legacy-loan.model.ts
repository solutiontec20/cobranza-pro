import { FrequencyType } from './profile.model';

/**
 * Temporary contract for the local MVP store and collector screens.
 * New Supabase-backed features must use loan.model.ts instead.
 */
export interface LegacyLoan {
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
  status: 'ACTIVE' | 'PAID';
  createdAt: string;
}
