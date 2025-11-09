// Centralized type definitions

export interface User {
  id: string;
  email: string;
  full_name?: string;
  company_name?: string;
  phone?: string;
  timezone?: string;
  retell_api_key?: string;
  created_at: string;
  updated_at: string;
}

export interface Agent {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  retell_agent_id?: string;
  retell_llm_id?: string;
  phone_number_id?: string;
  status: 'draft' | 'active' | 'inactive';
  customizations?: any;
  settings?: any;
  created_at: string;
  updated_at: string;
}

export interface AgentConfig {
  voice_id: string;
  language: string;
  response_delay: number;
  interruption_sensitivity: number;
  temperature: number;
  max_tokens: number;
  greeting_message?: string;
  system_prompt?: string;
  tools?: string[];
}

export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  agent_id: string;
  contact_group_id: string;
  status: 'draft' | 'scheduled' | 'active' | 'paused' | 'completed';
  timezone: string;
  start_date?: string;
  end_date?: string;
  daily_start_time: string;
  daily_end_time: string;
  max_concurrent_calls: number;
  retry_attempts: number;
  retry_interval: number;
  active_days: number[];
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  contact_group_id: string;
  first_name?: string;
  last_name?: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  custom_fields?: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface ContactGroup {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  contact_count: number;
  created_at: string;
  updated_at: string;
}

export interface CallRecord {
  id: string;
  campaign_id: string;
  contact_id: string;
  agent_id: string;
  call_id: string;
  status: 'completed' | 'failed' | 'no-answer' | 'busy' | 'voicemail';
  duration: number;
  transcript?: string;
  recording_url?: string;
  sentiment?: string;
  appointment_booked: boolean;
  cost_cents: number;
  created_at: string;
  updated_at: string;
}

export interface PhoneNumber {
  id: string;
  user_id: string;
  phone_number: string;
  area_code: string;
  status: 'active' | 'inactive';
  agent_id?: string;
  monthly_cost_cents: number;
  created_at: string;
  updated_at: string;
}

export interface CreditTransaction {
  id: string;
  user_id: string;
  type: 'purchase' | 'usage' | 'refund';
  amount_cents: number;
  balance_after_cents: number;
  description: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface RetellWebhookPayload {
  event: 'call_started' | 'call_ended' | 'call_analyzed';
  call: {
    call_id: string;
    agent_id?: string;
    from_number?: string;
    to_number?: string;
    metadata?: Record<string, unknown>;
    transcript?: string;
    recording_url?: string;
    duration_ms?: number;
    disconnection_reason?: string;
    call_cost?: {
      combined_cost: number;
      total_duration_seconds: number;
    };
  };
}