// @ts-nocheck
import { supabase } from '@/integrations/supabase/client';
import { authService } from './auth.service';
import { baseService } from './base.service';

interface Agent {
  id: string;
  name: string;
  retell_llm_id: string;
  retell_agent_id: string;
  phone_number_id?: string;
  is_active: boolean;
  status: 'draft' | 'deployed' | 'archived';
  customizations?: any;
  settings?: any;
  template_id?: string;
  created_at: string;
  updated_at: string;
}

interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  template_type: 'seller' | 'landlord' | 'buyer' | 'investor';
  default_settings?: any;
  base_prompt?: string;
  prompt_template: string;
}

/**
 * Service for agent operations
 */
export const agentsService = {
  /**
   * Get all agents for the current user
   */
  async getAll(includePhoneNumbers = true) {
    const user = await authService.requireAuth();
    
    let query = supabase
      .from('user_agents')
      .select(includePhoneNumbers ? '*, phone_numbers(*)' : '*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    
    const response = await query;
    return baseService.handleResponse(response);
  },

  /**
   * Get active agents only
   */
  async getActive() {
    const user = await authService.requireAuth();
    
    const response = await supabase
      .from('user_agents')
      .select('*, phone_numbers(*)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .eq('status', 'deployed')
      .order('name');
    
    return baseService.handleResponse(response);
  },

  /**
   * Get a single agent by ID
   */
  async getById(agentId: string) {
    const user = await authService.requireAuth();
    
    const response = await supabase
      .from('user_agents')
      .select(`
        *,
        phone_numbers(*),
        agent_templates(*)
      `)
      .eq('id', agentId)
      .eq('user_id', user.id)
      .single();
    
    return baseService.handleResponse(response);
  },

  /**
   * Check if agent can be edited (not in active campaign)
   */
  async canEdit(agentId: string): Promise<boolean> {
    const response = await supabase
      .rpc('check_agent_edit_allowed', { agent_uuid: agentId });
    
    return baseService.handleResponse(response);
  },

  /**
   * Create a new agent
   */
  async create(agentData: Partial<Agent>) {
    const user = await authService.requireAuth();
    
    const response = await supabase
      .from('user_agents')
      .insert({
        ...agentData,
        user_id: user.id,
        status: 'draft',
        is_active: false,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    return baseService.handleResponse(response);
  },

  /**
   * Update an agent
   */
  async update(agentId: string, updates: Partial<Agent>) {
    const user = await authService.requireAuth();
    
    // Check if agent can be edited
    const canEdit = await this.canEdit(agentId);
    if (!canEdit) {
      throw new Error('Agent cannot be edited while in active campaign');
    }
    
    const response = await supabase
      .from('user_agents')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', agentId)
      .eq('user_id', user.id)
      .select()
      .single();
    
    return baseService.handleResponse(response);
  },

  /**
   * Deploy an agent
   */
  async deploy(agentId: string, phoneNumberId: string) {
    const user = await authService.requireAuth();
    
    const response = await supabase
      .from('user_agents')
      .update({
        status: 'deployed',
        is_active: true,
        phone_number_id: phoneNumberId,
        updated_at: new Date().toISOString()
      })
      .eq('id', agentId)
      .eq('user_id', user.id)
      .select()
      .single();
    
    return baseService.handleResponse(response);
  },

  /**
   * Archive an agent
   */
  async archive(agentId: string) {
    const user = await authService.requireAuth();
    
    // Check if agent is in active campaign
    const canEdit = await this.canEdit(agentId);
    if (!canEdit) {
      throw new Error('Agent cannot be archived while in active campaign');
    }
    
    const response = await supabase
      .from('user_agents')
      .update({
        status: 'archived',
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', agentId)
      .eq('user_id', user.id);
    
    baseService.handleMutation(response);
  },

  /**
   * Delete an agent
   */
  async delete(agentId: string) {
    const user = await authService.requireAuth();
    
    // Check if agent is in any campaign
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id')
      .eq('agent_id', agentId)
      .limit(1);
    
    if (campaigns && campaigns.length > 0) {
      throw new Error('Agent cannot be deleted as it is used in campaigns');
    }
    
    const response = await supabase
      .from('user_agents')
      .delete()
      .eq('id', agentId)
      .eq('user_id', user.id);
    
    baseService.handleMutation(response);
  },

  /**
   * Get available agent templates
   */
  async getTemplates() {
    const response = await supabase
      .from('agent_templates')
      .select('*')
      .eq('is_active', true)
      .order('display_order');
    
    return baseService.handleResponse(response);
  },

  /**
   * Get a template by ID
   */
  async getTemplateById(templateId: string) {
    const response = await supabase
      .from('agent_templates')
      .select('*')
      .eq('id', templateId)
      .single();
    
    return baseService.handleResponse(response);
  },

  /**
   * Create draft agent from template
   */
  async createDraftFromTemplate(templateId: string) {
    const user = await authService.requireAuth();
    const template = await this.getTemplateById(templateId);
    
    const response = await supabase
      .from('user_agents')
      .insert({
        user_id: user.id,
        name: `Draft - ${template.name}`,
        template_id: templateId,
        customizations: template.default_settings || {},
        settings: template.default_settings || {},
        status: 'draft',
        is_active: false,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    return baseService.handleResponse(response);
  },

  /**
   * Test an agent with a phone call
   */
  async testCall(agentId: string, testPhoneNumber: string) {
    const response = await supabase.functions.invoke('test-agent-call', {
      body: {
        agentId,
        phoneNumber: testPhoneNumber
      }
    });
    
    if (response.error) {
      throw new Error(response.error.message || 'Failed to initiate test call');
    }
    
    return response.data;
  }
};