export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          reason?: string | null
        }
        Relationships: []
      }
      billing_entries: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string
          factory_id: string
          id: string
          note: string | null
          reference_date: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by: string
          factory_id: string
          id?: string
          note?: string | null
          reference_date: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string
          factory_id?: string
          id?: string
          note?: string | null
          reference_date?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_entries_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factories"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_goal_overrides: {
        Row: {
          billing_goal_cents: number | null
          created_at: string
          created_by: string | null
          factory_id: string
          id: string
          reference_date: string
          sales_goal_cents: number | null
        }
        Insert: {
          billing_goal_cents?: number | null
          created_at?: string
          created_by?: string | null
          factory_id: string
          id?: string
          reference_date: string
          sales_goal_cents?: number | null
        }
        Update: {
          billing_goal_cents?: number | null
          created_at?: string
          created_by?: string | null
          factory_id?: string
          id?: string
          reference_date?: string
          sales_goal_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_goal_overrides_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factories"
            referencedColumns: ["id"]
          },
        ]
      }
      factories: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          state: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          state: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          state?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          billing_goal_cents: number
          created_at: string
          created_by: string | null
          factory_id: string
          id: string
          month: number
          sales_goal_cents: number
          updated_at: string
          updated_by: string | null
          year: number
        }
        Insert: {
          billing_goal_cents?: number
          created_at?: string
          created_by?: string | null
          factory_id: string
          id?: string
          month: number
          sales_goal_cents?: number
          updated_at?: string
          updated_by?: string | null
          year: number
        }
        Update: {
          billing_goal_cents?: number
          created_at?: string
          created_by?: string | null
          factory_id?: string
          id?: string
          month?: number
          sales_goal_cents?: number
          updated_at?: string
          updated_by?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "goals_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factories"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_delivery_logs: {
        Row: {
          attempted_at: string
          destination_id: string | null
          error: string | null
          id: string
          idempotency_key: string | null
          payload: Json | null
          response: Json | null
          rule_id: string | null
          status: Database["public"]["Enums"]["delivery_status"]
        }
        Insert: {
          attempted_at?: string
          destination_id?: string | null
          error?: string | null
          id?: string
          idempotency_key?: string | null
          payload?: Json | null
          response?: Json | null
          rule_id?: string | null
          status: Database["public"]["Enums"]["delivery_status"]
        }
        Update: {
          attempted_at?: string
          destination_id?: string | null
          error?: string | null
          id?: string
          idempotency_key?: string | null
          payload?: Json | null
          response?: Json | null
          rule_id?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
        }
        Relationships: [
          {
            foreignKeyName: "notification_delivery_logs_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "notification_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_delivery_logs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "notification_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_destinations: {
        Row: {
          chat_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          chat_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          chat_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      notification_rules: {
        Row: {
          created_at: string
          description: string | null
          destination_id: string | null
          id: string
          is_active: boolean
          last_run_at: string | null
          last_status: Database["public"]["Enums"]["delivery_status"] | null
          name: string
          next_run_at: string | null
          rule_type: string
          schedule_cron: string | null
          schedule_label: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          destination_id?: string | null
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          last_status?: Database["public"]["Enums"]["delivery_status"] | null
          name: string
          next_run_at?: string | null
          rule_type: string
          schedule_cron?: string | null
          schedule_label?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          destination_id?: string | null
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          last_status?: Database["public"]["Enums"]["delivery_status"] | null
          name?: string
          next_run_at?: string | null
          rule_type?: string
          schedule_cron?: string | null
          schedule_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_rules_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "notification_destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          last_sign_in_at: string | null
          must_change_password: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
          is_active?: boolean
          last_sign_in_at?: string | null
          must_change_password?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          last_sign_in_at?: string | null
          must_change_password?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      sales_entries: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string
          factory_id: string
          id: string
          note: string | null
          reference_date: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by: string
          factory_id: string
          id?: string
          note?: string | null
          reference_date: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string
          factory_id?: string
          id?: string
          note?: string | null
          reference_date?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_entries_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_factory_access: {
        Row: {
          created_at: string
          factory_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          factory_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          factory_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_factory_access_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          created_at: string
          id: string
          permission: Database["public"]["Enums"]["app_permission"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission: Database["public"]["Enums"]["app_permission"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission?: Database["public"]["Enums"]["app_permission"]
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      work_calendar_days: {
        Row: {
          created_at: string
          created_by: string | null
          day: string
          factory_id: string
          id: string
          is_workday: boolean
          note: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          day: string
          factory_id: string
          id?: string
          is_workday?: boolean
          note?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          day?: string
          factory_id?: string
          id?: string
          is_workday?: boolean
          note?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_calendar_days_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_factory_access: {
        Args: { _factory_id: string; _user_id: string }
        Returns: boolean
      }
      has_permission: {
        Args: {
          _permission: Database["public"]["Enums"]["app_permission"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_user: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_permission:
        | "manage_goals"
        | "manage_work_calendar"
        | "manage_notifications"
        | "view_audit"
      app_role:
        | "admin"
        | "diretoria"
        | "gerente_comercial"
        | "assistente_vendas"
        | "responsavel_faturamento"
      delivery_status: "pending" | "sent" | "failed"
      entry_type: "sales" | "billing"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_permission: [
        "manage_goals",
        "manage_work_calendar",
        "manage_notifications",
        "view_audit",
      ],
      app_role: [
        "admin",
        "diretoria",
        "gerente_comercial",
        "assistente_vendas",
        "responsavel_faturamento",
      ],
      delivery_status: ["pending", "sent", "failed"],
      entry_type: ["sales", "billing"],
    },
  },
} as const
