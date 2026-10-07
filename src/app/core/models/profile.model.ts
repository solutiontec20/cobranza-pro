export type UserRole = 'ADMINISTRADOR' | 'COBRADOR';
export type LoanStatus = 'ACTIVE' | 'PAID' | 'DEFAULTED';
export type InstallmentStatus = 'PENDIENTE' | 'PAGADO' | 'PAGO_PARCIAL' | 'VENCIDO';
export type FrequencyType = 'DIARIO' | 'SEMANAL' | 'MENSUAL' | 'ANUAL';
export type RiskLevel = 'current' | 'warning' | 'late' | 'defaulted' | 'paid' | 'none' | 'green' | 'yellow' | 'orange' | 'red' | 'gray';

export interface Profile {
  id: string;
  dni: string;
  fullName: string;
  phone: string;
  role: UserRole;
  pin: string;
  active: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
}
