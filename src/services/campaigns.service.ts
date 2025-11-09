// @ts-nocheck
import { supabase } from '@/integrations/supabase/client';
import { authService } from './auth.service';
import { baseService } from './base.service';
import { validateCampaignTransition, type CampaignStatus } from '@/lib/campaign-state-machine';

interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  user_id: string;
  agent_id: string;
  contact_group_id: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  concurrent_calls: number;
  max_retry_days: number;
  calling_hours: any;
  active_days: string[];
  field_mappings: any;
  timezone?: string;
  paused_reason?: string | null;
}

/**
 * Service for campaign operations
 */
export const campaignsService = {
  /**
   * Get all campaigns for the current user
   */
  async getAll() {
    const user = await authService.requireAuth();
    
    const response = await supabase
      .from('campaigns')
      .select(`
        *,
        user_agents(name, phone_numbers(phone_number)),
        contact_groups(name, contacts(count))
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    
    return baseService.handleResponse(response);
  },

  /**
   * Get a single campaign by ID
   */
  async getById(campaignId: string) {
    const user = await authService.requireAuth();
    
    const response = await supabase
      .from('campaigns')
      .select(`
        *,
        user_agents(name, phone_numbers(phone_number)),
        contact_groups(name, contacts(count))
      `)
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .single();
    
    return baseService.handleResponse(response);
  },

  /**
   * Create a new campaign
   */
  async create(campaignData: Partial<Campaign>) {
    const user = await authService.requireAuth();
    
    // If creating campaign as 'active', validate required fields
    if (campaignData.status === 'active') {
      if (!campaignData.agent_id) {
        throw new Error('Cannot create active campaign without an agent');
      }
      if (!campaignData.contact_group_id) {
        throw new Error('Cannot create active campaign without a contact group');
      }
    }
    
    const response = await supabase
      .from('campaigns')
      .insert({
        ...campaignData,
        user_id: user.id,
        status: campaignData.status || 'draft', // Use provided status or default to 'draft'
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    return baseService.handleResponse(response);
  },

  /**
   * Update campaign status with validation
   */
  async updateStatus(campaignId: string, newStatus: CampaignStatus, reason?: string) {
    const user = await authService.requireAuth();
    
    // Get current campaign status
    const campaign = await this.getById(campaignId);
    
    // Validate transition
    const validation = validateCampaignTransition(campaign, newStatus);
    if (!validation.valid) {
      throw new Error(validation.error || `Cannot transition from ${campaign.status} to ${newStatus}`);
    }
    
    const updateData: any = {
      status: newStatus,
      updated_at: new Date().toISOString()
    };
    
    if (newStatus === 'active') {
      updateData.started_at = new Date().toISOString();
    } else if (newStatus === 'completed') {
      updateData.completed_at = new Date().toISOString();
    } else if (newStatus === 'paused' && reason) {
      updateData.paused_reason = reason;
    }
    
    const response = await supabase
      .from('campaigns')
      .update(updateData)
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .select()
      .single();
    
    return baseService.handleResponse(response);
  },

  /**
   * Delete a campaign
   */
  async delete(campaignId: string) {
    const user = await authService.requireAuth();
    
    const response = await supabase
      .from('campaigns')
      .delete()
      .eq('id', campaignId)
      .eq('user_id', user.id);
    
    baseService.handleMutation(response);
  },

  /**
   * Get campaign metrics
   */
  async getMetrics(campaignId: string) {
    const response = await supabase
      .from('campaigns')
      .select(`
        id,
        contact_groups!inner(contacts(count))
      `)
      .eq('id', campaignId)
      .single();
    
    const campaignData = baseService.handleOptionalResponse(response);
    
    // Get call attempts
    const attemptsResponse = await supabase
      .from('call_attempts')
      .select('status')
      .eq('campaign_id', campaignId);
    
    const attempts = baseService.handleOptionalResponse(attemptsResponse) || [];
    
    // Calculate metrics
    const totalContacts = campaignData?.contact_groups?.contacts?.[0]?.count || 0;
    const completedContacts = attempts.filter(a => a.status === 'completed').length;
    const inProgressCalls = attempts.filter(a => a.status === 'in_progress').length;
    const successRate = completedContacts > 0 
      ? Math.round((attempts.filter(a => a.status === 'success').length / completedContacts) * 100)
      : 0;
    
    return {
      total_contacts: totalContacts,
      completed_contacts: completedContacts,
      in_progress_calls: inProgressCalls,
      success_rate: successRate,
      pickups: attempts.filter(a => a.status === 'answered').length,
      no_answers: attempts.filter(a => a.status === 'no_answer').length,
      failed_calls: attempts.filter(a => a.status === 'failed').length
    };
  },

  /**
   * Check if user has sufficient credits to start campaign
   */
  async checkCreditsForCampaign(estimatedCost: number = 100) {
    const user = await authService.requireAuth();
    
    const response = await supabase.rpc('check_and_reserve_credits', {
      p_user_id: user.id,
      p_estimated_cost_cents: estimatedCost
    });
    
    const creditCheck = baseService.handleResponse(response);
    
    return {
      canProceed: creditCheck.can_proceed,
      currentBalance: creditCheck.current_balance,
      warningLevel: creditCheck.warning_level,
      message: creditCheck.message
    };
  }
};