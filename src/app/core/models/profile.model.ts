import { Database } from "../supabase/database.types";

export type UserRole = Database['public']['Enums']['app_role'] // "admin" | "supervisor" | "collector"
export type LoanStatus = 'ACTIVE' | 'PAID' | 'DEFAULTED';
export type InstallmentStatus = 'PENDIENTE' | 'PAGADO' | 'PAGO_PARCIAL' | 'VENCIDO';
export type FrequencyType = 'DIARIO' | 'SEMANAL' | 'MENSUAL' | 'ANUAL';
export type RiskLevel = 'current' | 'warning' | 'late' | 'defaulted' | 'paid' | 'none' | 'green' | 'yellow' | 'orange' | 'red' | 'gray';

    export interface Profile {
      id: string;
      dni: string;
      fullName: string;
      role: UserRole;
      active: boolean;
      phone?: string;
    }
