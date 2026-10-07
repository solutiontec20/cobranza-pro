import { Client } from './client.model';
import { Installment } from './installment.model';
import { Loan } from './loan.model';
import { Profile } from './profile.model';

export interface Payment {
  id: string;
  loanId: string;
  clientId: string;
  collectorId: string;
  amount: number;
  date: string;
  notes: string;
  createdBy: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entity: string;
  entityId: string;
  details: string;
  createdAt: string;
}

export interface AppDatabase {
  profiles: Profile[];
  clients: Client[];
  loans: Loan[];
  loanInstallments: Installment[];
  payments: Payment[];
  auditLogs: AuditLog[];
}
