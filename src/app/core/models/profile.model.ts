import { Database } from "../supabase/database.types";

export type UserRole = Database['public']['Enums']['app_role'] // "admin" | "supervisor" | "collector"

export interface Profile {
  id: string;
  dni: string;
  fullName: string;
  role: UserRole;
  active: boolean;
  mustChangePin: boolean;
  phone?: string;
}

export interface ChangePinInput {
  currentPin: string;
  newPin: string;
}
