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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      agent_templates: {
        Row: {
          base_prompt: string
          created_at: string | null
          default_settings: Json | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          template_type: string
          updated_at: string | null
        }
        Insert: {
          base_prompt: string
          created_at?: string | null
          default_settings?: Json | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          template_type: string
          updated_at?: string | null
        }
        Update: {
          base_prompt?: string
          created_at?: string | null
          default_settings?: Json | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          template_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      lead_specs: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          lead_type: string
          spec: Json
          title: string | null
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          lead_type: string
          spec: Json
          title?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          lead_type?: string
          spec?: Json
          title?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_specs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_costs: {
        Row: {
          call_duration_seconds: number | null
          campaign_contact_attempt_id: string
          cost_breakdown: Json | null
          created_at: string | null
          id: string
          retell_cost_cents: number
          user_cost_cents: number
        }
        Insert: {
          call_duration_seconds?: number | null
          campaign_contact_attempt_id: string
          cost_breakdown?: Json | null
          created_at?: string | null
          id?: string
          retell_cost_cents: number
          user_cost_cents: number
        }
        Update: {
          call_duration_seconds?: number | null
          campaign_contact_attempt_id?: string
          cost_breakdown?: Json | null
          created_at?: string | null
          id?: string
          retell_cost_cents?: number
          user_cost_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "call_costs_campaign_contact_attempt_id_fkey"
            columns: ["campaign_contact_attempt_id"]
            isOneToOne: false
            referencedRelation: "campaign_contact_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      call_records: {
        Row: {
          agent_id: string | null
          campaign_id: string | null
          contact_id: string | null
          created_at: string | null
          duration: number | null
          ended_at: string | null
          id: string
          metadata: Json | null
          phone_number: string
          recording_url: string | null
          retell_call_id: string | null
          sentiment: Database["public"]["Enums"]["sentiment_type"] | null
          started_at: string | null
          status: Database["public"]["Enums"]["call_status"]
          transcript: string | null
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          duration?: number | null
          ended_at?: string | null
          id?: string
          metadata?: Json | null
          phone_number: string
          recording_url?: string | null
          retell_call_id?: string | null
          sentiment?: Database["public"]["Enums"]["sentiment_type"] | null
          started_at?: string | null
          status: Database["public"]["Enums"]["call_status"]
          transcript?: string | null
          user_id: string
        }
        Update: {
          agent_id?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          duration?: number | null
          ended_at?: string | null
          id?: string
          metadata?: Json | null
          phone_number?: string
          recording_url?: string | null
          retell_call_id?: string | null
          sentiment?: Database["public"]["Enums"]["sentiment_type"] | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["call_status"]
          transcript?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_records_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "user_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_records_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_records_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      compiled_prompts: {
        Row: {
          compiled_by: string
          created_at: string
          id: string
          lead_spec_id: string
          notes: Json
          state_graph: Json
          system_base_prompt: string
          variant: Json
        }
        Insert: {
          compiled_by: string
          created_at?: string
          id?: string
          lead_spec_id: string
          notes?: Json
          state_graph: Json
          system_base_prompt: string
          variant?: Json
        }
        Update: {
          compiled_by?: string
          created_at?: string
          id?: string
          lead_spec_id?: string
          notes?: Json
          state_graph?: Json
          system_base_prompt?: string
          variant?: Json
        }
        Relationships: [
          {
            foreignKeyName: "compiled_prompts_compiled_by_fkey"
            columns: ["compiled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compiled_prompts_lead_spec_id_fkey"
            columns: ["lead_spec_id"]
            isOneToOne: false
            referencedRelation: "lead_specs"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_contact_attempts: {
        Row: {
          actual_time: string | null
          appointment_data: Json | null
          attempt_day: number
          attempt_number: number
          call_duration: number | null
          call_status: Database["public"]["Enums"]["call_status"] | null
          call_successful: boolean | null
          call_summary: Json | null
          campaign_id: string | null
          contact_id: string | null
          created_at: string | null
          custom_analysis: Json | null
          ended_at: string | null
          follow_up_potential: string | null
          follow_up_reason: string | null
          id: string
          phone_index: number | null
          phone_number: string
          recording_url: string | null
          retell_call_data: Json | null
          retell_call_id: string | null
          scheduled_time: string | null
          total_phones: number | null
          transcript: string | null
          user_id: string | null
        }
        Insert: {
          actual_time?: string | null
          appointment_data?: Json | null
          attempt_day?: number
          attempt_number: number
          call_duration?: number | null
          call_status?: Database["public"]["Enums"]["call_status"] | null
          call_successful?: boolean | null
          call_summary?: Json | null
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          custom_analysis?: Json | null
          ended_at?: string | null
          follow_up_potential?: string | null
          follow_up_reason?: string | null
          id?: string
          phone_index?: number | null
          phone_number: string
          recording_url?: string | null
          retell_call_data?: Json | null
          retell_call_id?: string | null
          scheduled_time?: string | null
          total_phones?: number | null
          transcript?: string | null
          user_id?: string | null
        }
        Update: {
          actual_time?: string | null
          appointment_data?: Json | null
          attempt_day?: number
          attempt_number?: number
          call_duration?: number | null
          call_status?: Database["public"]["Enums"]["call_status"] | null
          call_successful?: boolean | null
          call_summary?: Json | null
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          custom_analysis?: Json | null
          ended_at?: string | null
          follow_up_potential?: string | null
          follow_up_reason?: string | null
          id?: string
          phone_index?: number | null
          phone_number?: string
          recording_url?: string | null
          retell_call_data?: Json | null
          retell_call_id?: string | null
          scheduled_time?: string | null
          total_phones?: number | null
          transcript?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_contact_attempts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_contact_attempts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      compiler_feedback: {
        Row: {
          compiled_prompt_id: string | null
          created_at: string
          created_by: string
          edited_prompt: string | null
          feedback: string | null
          id: string
          lead_type: string
          rating: number
        }
        Insert: {
          compiled_prompt_id?: string | null
          created_at?: string
          created_by: string
          edited_prompt?: string | null
          feedback?: string | null
          id?: string
          lead_type: string
          rating: number
        }
        Update: {
          compiled_prompt_id?: string | null
          created_at?: string
          created_by?: string
          edited_prompt?: string | null
          feedback?: string | null
          id?: string
          lead_type?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "compiler_feedback_compiled_prompt_id_fkey"
            columns: ["compiled_prompt_id"]
            isOneToOne: false
            referencedRelation: "compiled_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compiler_feedback_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_contacts: {
        Row: {
          campaign_id: string
          contact_group_id: string
          created_at: string | null
          field_mappings: Json | null
          id: string
          selected_fields: Json | null
        }
        Insert: {
          campaign_id: string
          contact_group_id: string
          created_at?: string | null
          field_mappings?: Json | null
          id?: string
          selected_fields?: Json | null
        }
        Update: {
          campaign_id?: string
          contact_group_id?: string
          created_at?: string | null
          field_mappings?: Json | null
          id?: string
          selected_fields?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_contacts_contact_group_id_fkey"
            columns: ["contact_group_id"]
            isOneToOne: false
            referencedRelation: "contact_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          active_calls_count: number | null
          active_days: string[] | null
          agent_id: string | null
          calling_hours: Json | null
          completed_at: string | null
          concurrent_calls: number | null
          contact_group_id: string | null
          created_at: string | null
          description: string | null
          field_mappings: Json | null
          id: string
          max_retry_days: number | null
          name: string
          paused_reason: string | null
          schedule_config: Json | null
          settings: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["campaign_status"] | null
          timezone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active_calls_count?: number | null
          active_days?: string[] | null
          agent_id?: string | null
          calling_hours?: Json | null
          completed_at?: string | null
          concurrent_calls?: number | null
          contact_group_id?: string | null
          created_at?: string | null
          description?: string | null
          field_mappings?: Json | null
          id?: string
          max_retry_days?: number | null
          name: string
          paused_reason?: string | null
          schedule_config?: Json | null
          settings?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"] | null
          timezone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active_calls_count?: number | null
          active_days?: string[] | null
          agent_id?: string | null
          calling_hours?: Json | null
          completed_at?: string | null
          concurrent_calls?: number | null
          contact_group_id?: string | null
          created_at?: string | null
          description?: string | null
          field_mappings?: Json | null
          id?: string
          max_retry_days?: number | null
          name?: string
          paused_reason?: string | null
          schedule_config?: Json | null
          settings?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"] | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "user_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_contact_group_id_fkey"
            columns: ["contact_group_id"]
            isOneToOne: false
            referencedRelation: "contact_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_groups: {
        Row: {
          created_at: string | null
          csv_headers: string[] | null
          description: string | null
          id: string
          name: string
          status: Database["public"]["Enums"]["contact_group_status"] | null
          total_contacts: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          csv_headers?: string[] | null
          description?: string | null
          id?: string
          name: string
          status?: Database["public"]["Enums"]["contact_group_status"] | null
          total_contacts?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          csv_headers?: string[] | null
          description?: string | null
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["contact_group_status"] | null
          total_contacts?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          address: string | null
          contact_group_id: string
          created_at: string | null
          custom_fields: Json | null
          data: Json
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone_number: string
          phone_numbers: string[] | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          contact_group_id: string
          created_at?: string | null
          custom_fields?: Json | null
          data?: Json
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone_number: string
          phone_numbers?: string[] | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          contact_group_id?: string
          created_at?: string | null
          custom_fields?: Json | null
          data?: Json
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone_number?: string
          phone_numbers?: string[] | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_group_id_fkey"
            columns: ["contact_group_id"]
            isOneToOne: false
            referencedRelation: "contact_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_packages: {
        Row: {
          created_at: string | null
          credits_cents: number
          id: string
          is_active: boolean | null
          name: string
          price_cents: number
          stripe_price_id: string | null
        }
        Insert: {
          created_at?: string | null
          credits_cents: number
          id?: string
          is_active?: boolean | null
          name: string
          price_cents: number
          stripe_price_id?: string | null
        }
        Update: {
          created_at?: string | null
          credits_cents?: number
          id?: string
          is_active?: boolean | null
          name?: string
          price_cents?: number
          stripe_price_id?: string | null
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          amount_cents: number
          balance_after_cents: number
          created_at: string | null
          description: string | null
          id: string
          metadata: Json | null
          type: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          balance_after_cents: number
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          type: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          balance_after_cents?: number
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      phone_numbers: {
        Row: {
          agent_id: string | null
          area_code: string
          created_at: string | null
          id: string
          monthly_cost_cents: number
          next_billing_date: string | null
          phone_number: string
          purchased_at: string | null
          retell_phone_id: string | null
          status: Database["public"]["Enums"]["phone_status"] | null
          stripe_subscription_id: string | null
          subscription_active: boolean
          updated_at: string | null
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          area_code: string
          created_at?: string | null
          id?: string
          monthly_cost_cents?: number
          next_billing_date?: string | null
          phone_number: string
          purchased_at?: string | null
          retell_phone_id?: string | null
          status?: Database["public"]["Enums"]["phone_status"] | null
          stripe_subscription_id?: string | null
          subscription_active?: boolean
          updated_at?: string | null
          user_id: string
        }
        Update: {
          agent_id?: string | null
          area_code?: string
          created_at?: string | null
          id?: string
          monthly_cost_cents?: number
          next_billing_date?: string | null
          phone_number?: string
          purchased_at?: string | null
          retell_phone_id?: string | null
          status?: Database["public"]["Enums"]["phone_status"] | null
          stripe_subscription_id?: string | null
          subscription_active?: boolean
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      phone_subscription_transactions: {
        Row: {
          amount_cents: number
          billing_period_end: string
          billing_period_start: string
          created_at: string
          id: string
          payment_status: string
          phone_number_id: string | null
          stripe_payment_intent_id: string | null
          transaction_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          billing_period_end: string
          billing_period_start: string
          created_at?: string
          id?: string
          payment_status?: string
          phone_number_id?: string | null
          stripe_payment_intent_id?: string | null
          transaction_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          billing_period_end?: string
          billing_period_start?: string
          created_at?: string
          id?: string
          payment_status?: string
          phone_number_id?: string | null
          stripe_payment_intent_id?: string | null
          transaction_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_subscription_transactions_phone_number_id_fkey"
            columns: ["phone_number_id"]
            isOneToOne: false
            referencedRelation: "phone_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string | null
          first_name: string | null
          id: string
          last_name: string | null
          plan: Database["public"]["Enums"]["user_plan"] | null
          retell_api_key: string | null
          role: Database["public"]["Enums"]["app_role"] | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          plan?: Database["public"]["Enums"]["user_plan"] | null
          retell_api_key?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          plan?: Database["public"]["Enums"]["user_plan"] | null
          retell_api_key?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_agents: {
        Row: {
          configured_prompt: string | null
          created_at: string | null
          customizations: Json | null
          dynamic_prompt: string | null
          id: string
          is_active: boolean | null
          name: string
          phone_number_id: string | null
          prompt_cache_key: string | null
          prompt_updated_at: string | null
          retell_agent_id: string | null
          retell_llm_id: string | null
          settings: Json | null
          status: string | null
          template_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          configured_prompt?: string | null
          created_at?: string | null
          customizations?: Json | null
          dynamic_prompt?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          phone_number_id?: string | null
          prompt_cache_key?: string | null
          prompt_updated_at?: string | null
          retell_agent_id?: string | null
          retell_llm_id?: string | null
          settings?: Json | null
          status?: string | null
          template_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          configured_prompt?: string | null
          created_at?: string | null
          customizations?: Json | null
          dynamic_prompt?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          phone_number_id?: string | null
          prompt_cache_key?: string | null
          prompt_updated_at?: string | null
          retell_agent_id?: string | null
          retell_llm_id?: string | null
          settings?: Json | null
          status?: string | null
          template_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_agents_phone_number_id_fkey"
            columns: ["phone_number_id"]
            isOneToOne: false
            referencedRelation: "phone_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_agents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "agent_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_credits: {
        Row: {
          balance_cents: number | null
          created_at: string | null
          id: string
          last_topped_up: string | null
          reserved_cents: number | null
          total_purchased_cents: number | null
          total_spent_cents: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance_cents?: number | null
          created_at?: string | null
          id?: string
          last_topped_up?: string | null
          reserved_cents?: number | null
          total_purchased_cents?: number | null
          total_spent_cents?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance_cents?: number | null
          created_at?: string | null
          id?: string
          last_topped_up?: string | null
          reserved_cents?: number | null
          total_purchased_cents?: number | null
          total_spent_cents?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      web_call_costs: {
        Row: {
          call_duration_seconds: number | null
          cost_breakdown: Json | null
          created_at: string
          id: string
          retell_cost_cents: number
          user_cost_cents: number
          web_call_session_id: string
        }
        Insert: {
          call_duration_seconds?: number | null
          cost_breakdown?: Json | null
          created_at?: string
          id?: string
          retell_cost_cents: number
          user_cost_cents: number
          web_call_session_id: string
        }
        Update: {
          call_duration_seconds?: number | null
          cost_breakdown?: Json | null
          created_at?: string
          id?: string
          retell_cost_cents?: number
          user_cost_cents?: number
          web_call_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "web_call_costs_web_call_session_id_fkey"
            columns: ["web_call_session_id"]
            isOneToOne: false
            referencedRelation: "web_call_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      web_call_sessions: {
        Row: {
          agent_id: string
          appointment_data: Json | null
          call_successful: boolean | null
          call_summary: Json | null
          created_at: string
          custom_analysis: Json | null
          duration_seconds: number | null
          ended_at: string | null
          id: string
          metadata: Json
          recording_url: string | null
          retell_call_id: string | null
          started_at: string | null
          status: string | null
          transcript: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          appointment_data?: Json | null
          call_successful?: boolean | null
          call_summary?: Json | null
          created_at?: string
          custom_analysis?: Json | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          metadata?: Json
          recording_url?: string | null
          retell_call_id?: string | null
          started_at?: string | null
          status?: string | null
          transcript?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          appointment_data?: Json | null
          call_successful?: boolean | null
          call_summary?: Json | null
          created_at?: string
          custom_analysis?: Json | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          metadata?: Json
          recording_url?: string | null
          retell_call_id?: string | null
          started_at?: string | null
          status?: string | null
          transcript?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "web_call_sessions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "user_agents"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      atomic_deduct_call_cost: {
        Args: {
          p_attempt_id: string
          p_call_metadata: Json
          p_cost_cents: number
          p_user_id: string
        }
        Returns: Json
      }
      atomic_deduct_web_call_cost: {
        Args: {
          p_call_metadata: Json
          p_cost_cents: number
          p_user_id: string
          p_web_call_id: string
        }
        Returns: Json
      }
      check_agent_edit_allowed: {
        Args: { agent_uuid: string }
        Returns: Json
      }
      check_and_reserve_credits: {
        Args: { p_estimated_cost_cents?: number; p_user_id: string }
        Returns: Json
      }
      deduct_credits: {
        Args: {
          p_amount_cents: number
          p_description?: string
          p_metadata?: Json
          p_user_id: string
        }
        Returns: Json
      }
      get_available_credits: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_credit_status: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_next_contacts_to_call: {
        Args: {
          p_campaign_id: string
          p_limit: number
          p_max_retry_days: number
        }
        Returns: {
          contact_data: Json
          contact_id: string
          phone_index: number
          phone_number: string
          total_phones: number
        }[]
      }
      release_reserved_credits: {
        Args: { p_amount_cents: number; p_user_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "user"
      call_status: "completed" | "failed" | "busy" | "no-answer" | "in-progress"
      campaign_status: "active" | "paused" | "completed" | "scheduled" | "draft"
      contact_group_status: "active" | "paused" | "completed"
      phone_status: "active" | "inactive"
      sentiment_type: "positive" | "neutral" | "negative"
      user_plan: "basic" | "professional" | "summit"
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
      app_role: ["admin", "manager", "user"],
      call_status: ["completed", "failed", "busy", "no-answer", "in-progress"],
      campaign_status: ["active", "paused", "completed", "scheduled", "draft"],
      contact_group_status: ["active", "paused", "completed"],
      phone_status: ["active", "inactive"],
      sentiment_type: ["positive", "neutral", "negative"],
      user_plan: ["basic", "professional", "summit"],
    },
  },
} as const
