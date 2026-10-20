
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "cash_closures": {
                  Row: {
                    "business_date": string,"collector_id": string,"created_at": string,"created_by": string,"delivered_amount": number,"difference_amount": number | null,"expected_amount": number,"id": string,"observation": string | null,"status": Database["public"]['Enums']["cash_closure_status"],"submitted_at": string | null,"updated_at": string,"validated_at": string | null,"validated_by": string | null
                  }
                  Insert: {
                    "business_date": string,"collector_id": string,"created_at"?: string,"created_by": string,"delivered_amount": number,"difference_amount"?: never,"expected_amount": number,"id"?: string,"observation"?: string | null,"status"?: Database["public"]['Enums']["cash_closure_status"],"submitted_at"?: string | null,"updated_at"?: string,"validated_at"?: string | null,"validated_by"?: string | null
                  }
                  Update: {
                    "business_date"?: string,"collector_id"?: string,"created_at"?: string,"created_by"?: string,"delivered_amount"?: number,"difference_amount"?: never,"expected_amount"?: number,"id"?: string,"observation"?: string | null,"status"?: Database["public"]['Enums']["cash_closure_status"],"submitted_at"?: string | null,"updated_at"?: string,"validated_at"?: string | null,"validated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cash_closures_collector_id_fkey"
      columns: ["collector_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_closures_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_closures_validated_by_fkey"
      columns: ["validated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"cash_movements": {
                  Row: {
                    "amount": number,"business_date": string,"collector_id": string,"created_at": string,"created_by": string,"customer_id": string | null,"direction": Database["public"]['Enums']["cash_direction"],"id": string,"loan_id": string | null,"movement_type": string,"notes": string | null,"occurred_at": string,"payment_id": string | null,"payment_method": string | null,"reversal_of_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "amount": number,"business_date"?: string,"collector_id": string,"created_at"?: string,"created_by": string,"customer_id"?: string | null,"direction": Database["public"]['Enums']["cash_direction"],"id"?: string,"loan_id"?: string | null,"movement_type": string,"notes"?: string | null,"occurred_at"?: string,"payment_id"?: string | null,"payment_method"?: string | null,"reversal_of_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"business_date"?: string,"collector_id"?: string,"created_at"?: string,"created_by"?: string,"customer_id"?: string | null,"direction"?: Database["public"]['Enums']["cash_direction"],"id"?: string,"loan_id"?: string | null,"movement_type"?: string,"notes"?: string | null,"occurred_at"?: string,"payment_id"?: string | null,"payment_method"?: string | null,"reversal_of_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cash_movements_collector_id_fkey"
      columns: ["collector_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_movements_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_movements_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customer_financial_status"
      referencedColumns: ["customer_id"]
    },{
      foreignKeyName: "cash_movements_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_movements_loan_id_fkey"
      columns: ["loan_id"]
isOneToOne: false
      referencedRelation: "loans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_movements_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_movements_reversal_of_id_fkey"
      columns: ["reversal_of_id"]
isOneToOne: false
      referencedRelation: "cash_movements"
      referencedColumns: ["id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "active": boolean,"address": string | null,"collector_id": string,"created_at": string,"created_by": string,"document_number": string,"full_name": string,"id": string,"notes": string | null,"phone": string | null,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"address"?: string | null,"collector_id": string,"created_at"?: string,"created_by": string,"document_number": string,"full_name": string,"id"?: string,"notes"?: string | null,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"address"?: string | null,"collector_id"?: string,"created_at"?: string,"created_by"?: string,"document_number"?: string,"full_name"?: string,"id"?: string,"notes"?: string | null,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customers_collector_id_fkey"
      columns: ["collector_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customers_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"installments": {
                  Row: {
                    "created_at": string,"due_date": string,"id": string,"installment_number": number,"loan_id": string,"scheduled_amount": number,"superseded_at": string | null,"superseded_by": string | null,"supersession_reason": string | null
                  }
                  Insert: {
                    "created_at"?: string,"due_date": string,"id"?: string,"installment_number": number,"loan_id": string,"scheduled_amount": number,"superseded_at"?: string | null,"superseded_by"?: string | null,"supersession_reason"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"due_date"?: string,"id"?: string,"installment_number"?: number,"loan_id"?: string,"scheduled_amount"?: number,"superseded_at"?: string | null,"superseded_by"?: string | null,"supersession_reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "installments_loan_id_fkey"
      columns: ["loan_id"]
isOneToOne: false
      referencedRelation: "loans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "installments_superseded_by_fkey"
      columns: ["superseded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"loans": {
                  Row: {
                    "close_reason": string | null,"closed_at": string | null,"created_at": string,"created_by": string,"customer_id": string,"disbursed_amount": number,"first_due_on": string,"frequency": Database["public"]['Enums']["loan_frequency"],"id": string,"installment_count": number,"interest_rate_percent": number,"previous_loan_id": string | null,"principal_amount": number,"started_on": string,"status": Database["public"]['Enums']["loan_status"],"total_amount": number,"updated_at": string
                  }
                  Insert: {
                    "close_reason"?: string | null,"closed_at"?: string | null,"created_at"?: string,"created_by": string,"customer_id": string,"disbursed_amount": number,"first_due_on": string,"frequency": Database["public"]['Enums']["loan_frequency"],"id"?: string,"installment_count": number,"interest_rate_percent": number,"previous_loan_id"?: string | null,"principal_amount": number,"started_on": string,"status"?: Database["public"]['Enums']["loan_status"],"total_amount": number,"updated_at"?: string
                  }
                  Update: {
                    "close_reason"?: string | null,"closed_at"?: string | null,"created_at"?: string,"created_by"?: string,"customer_id"?: string,"disbursed_amount"?: number,"first_due_on"?: string,"frequency"?: Database["public"]['Enums']["loan_frequency"],"id"?: string,"installment_count"?: number,"interest_rate_percent"?: number,"previous_loan_id"?: string | null,"principal_amount"?: number,"started_on"?: string,"status"?: Database["public"]['Enums']["loan_status"],"total_amount"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "loans_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "loans_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customer_financial_status"
      referencedColumns: ["customer_id"]
    },{
      foreignKeyName: "loans_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "loans_previous_loan_id_fkey"
      columns: ["previous_loan_id"]
isOneToOne: false
      referencedRelation: "loans"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_allocations": {
                  Row: {
                    "amount": number,"created_at": string,"id": string,"installment_id": string,"payment_id": string
                  }
                  Insert: {
                    "amount": number,"created_at"?: string,"id"?: string,"installment_id": string,"payment_id": string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"id"?: string,"installment_id"?: string,"payment_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_allocations_installment_id_fkey"
      columns: ["installment_id"]
isOneToOne: false
      referencedRelation: "installment_balances"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_allocations_installment_id_fkey"
      columns: ["installment_id"]
isOneToOne: false
      referencedRelation: "installments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_allocations_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"business_date": string,"collector_id": string,"corrected_from_payment_id": string | null,"created_at": string,"created_by": string,"id": string,"loan_id": string,"notes": string | null,"paid_at": string,"payment_method": string,"status": Database["public"]['Enums']["payment_status"],"updated_at": string,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  Insert: {
                    "amount": number,"business_date"?: string,"collector_id": string,"corrected_from_payment_id"?: string | null,"created_at"?: string,"created_by": string,"id"?: string,"loan_id": string,"notes"?: string | null,"paid_at"?: string,"payment_method": string,"status"?: Database["public"]['Enums']["payment_status"],"updated_at"?: string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "amount"?: number,"business_date"?: string,"collector_id"?: string,"corrected_from_payment_id"?: string | null,"created_at"?: string,"created_by"?: string,"id"?: string,"loan_id"?: string,"notes"?: string | null,"paid_at"?: string,"payment_method"?: string,"status"?: Database["public"]['Enums']["payment_status"],"updated_at"?: string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_collector_id_fkey"
      columns: ["collector_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_corrected_from_payment_id_fkey"
      columns: ["corrected_from_payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_loan_id_fkey"
      columns: ["loan_id"]
isOneToOne: false
      referencedRelation: "loans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "active": boolean,"created_at": string,"dni": string,"full_name": string,"id": string,"phone": string | null,"role": Database["public"]['Enums']["app_role"],"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"dni": string,"full_name": string,"id": string,"phone"?: string | null,"role": Database["public"]['Enums']["app_role"],"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"dni"?: string,"full_name"?: string,"id"?: string,"phone"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "customer_financial_status": {
                  Row: {
                    "customer_id": string | null,"is_blacklisted": boolean | null,"max_overdue_days": number | null,"outstanding_amount": number | null
                  }
                  Relationships: [
                    
                  ]
                },"installment_balances": {
                  Row: {
                    "due_date": string | null,"id": string | null,"installment_number": number | null,"loan_id": string | null,"outstanding_amount": number | null,"overdue_days": number | null,"paid_amount": number | null,"scheduled_amount": number | null,"status": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "installments_loan_id_fkey"
      columns: ["loan_id"]
isOneToOne: false
      referencedRelation: "loans"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "admin_create_collector_profile":
{ Args: { "p_dni": string,"p_full_name": string,"p_phone"?: string,"p_user_id": string }; Returns: {
              "active": boolean,"active_customer_count": number,"created_at": string,"dni": string,"full_name": string,"id": string,"phone": string
            }[]
                           },
"admin_create_loan":
{ Args: { "p_customer_id": string,"p_first_due_on": string,"p_frequency": Database["public"]['Enums']["loan_frequency"],"p_installment_count": number,"p_interest_rate": number,"p_principal": number,"p_started_on": string }; Returns: {
              "created_at": string,"customer_id": string,"disbursed_amount": number,"first_due_on": string,"frequency": Database["public"]['Enums']["loan_frequency"],"id": string,"installment_count": number,"interest_rate_percent": number,"principal_amount": number,"started_on": string,"status": Database["public"]['Enums']["loan_status"],"total_amount": number
            }[]
                           },
"admin_list_collectors":
{ Args: Record<PropertyKey, never>; Returns: {
              "active": boolean,"active_customer_count": number,"created_at": string,"dni": string,"full_name": string,"id": string,"phone": string
            }[]
                           },
"admin_set_collector_active":
{ Args: { "p_active": boolean,"p_collector_id": string,"p_reason": string }; Returns: {
              "active": boolean,"active_customer_count": number,"created_at": string,"dni": string,"full_name": string,"id": string,"phone": string
            }[]
                           },
"admin_update_loan":
{ Args: { "p_frequency": Database["public"]['Enums']["loan_frequency"],"p_installment_count": number,"p_interest_rate": number,"p_loan_id": string,"p_principal": number,"p_reason": string,"p_started_on": string }; Returns: {
              "created_at": string,"customer_id": string,"disbursed_amount": number,"first_due_on": string,"frequency": Database["public"]['Enums']["loan_frequency"],"id": string,"installment_count": number,"interest_rate_percent": number,"principal_amount": number,"started_on": string,"status": Database["public"]['Enums']["loan_status"],"total_amount": number
            }[]
                           },
"register_payment":
{ Args: { "p_amount": number,"p_loan_id": string,"p_notes"?: string,"p_paid_at"?: string,"p_payment_method": string }; Returns: {
              "allocated_amount": number,"payment_id": string,"remaining_balance": number,"resulting_loan_status": Database["public"]['Enums']["loan_status"]
            }[]
                           },
"submit_cash_closure":
{ Args: { "p_business_date": string,"p_delivered_amount": number,"p_observation"?: string }; Returns: {
              "closure_id": string,"closure_status": Database["public"]['Enums']["cash_closure_status"],"delivered_amount": number,"difference_amount": number,"expected_amount": number
            }[]
                           },
"validate_cash_closure":
{ Args: { "p_closure_id": string,"p_observation"?: string }; Returns: {
              "closure_id": string,"closure_status": Database["public"]['Enums']["cash_closure_status"],"delivered_amount": number,"difference_amount": number,"expected_amount": number
            }[]
                           },
"void_payment":
{ Args: { "p_payment_id": string,"p_reason": string }; Returns: {
              "loan_id": string,"payment_id": string,"remaining_balance": number
            }[]
                           }
          }
          Enums: {
            "app_role": "admin"|"supervisor"|"collector","cash_closure_status": "draft"|"submitted"|"validated","cash_direction": "inflow"|"outflow","loan_frequency": "daily"|"weekly"|"monthly","loan_status": "active"|"paid"|"renewed"|"voided","payment_status": "posted"|"voided"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "app_role": ["admin", "supervisor", "collector"],"cash_closure_status": ["draft", "submitted", "validated"],"cash_direction": ["inflow", "outflow"],"loan_frequency": ["daily", "weekly", "monthly"],"loan_status": ["active", "paid", "renewed", "voided"],"payment_status": ["posted", "voided"]
          }
        }
} as const
