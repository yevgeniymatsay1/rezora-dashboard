// @ts-nocheck
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AgentIdentityForm } from '../types/agent.types';

interface ExistingAgent {
  id: string;
  user_id: string;
  template_id?: string;
  name: string;
  description?: string;
  retell_agent_id?: string;
  retell_llm_id?: string;
  phone_number_id?: string;
  status: string;
  customizations?: AgentIdentityForm | Record<string, any>;
  settings?: AgentIdentityForm | Record<string, any>;
  created_at: string;
  updated_at: string;
  template?: {
    template_type: string;
  };
}

export function useAgentManagement(agentId?: string) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editLocked, setEditLocked] = useState(false);
  const [activeCampaignsCount, setActiveCampaignsCount] = useState(0);
  const [existingAgent, setExistingAgent] = useState<ExistingAgent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (agentId) {
      setIsEditMode(true);
      loadExistingAgent();
      checkActiveCampaigns();
    } else {
      setIsEditMode(false);
      setEditLocked(false);
      setActiveCampaignsCount(0);
      setLoading(false);
    }
  }, [agentId]);

  const loadExistingAgent = async () => {
    if (!agentId) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_agents')
        .select('*, template:agent_templates ( template_type )')
        .eq('id', agentId)
        .single();

      if (error) throw error;
      setExistingAgent(data);
    } catch (error) {
      console.error('Error loading existing agent:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkActiveCampaigns = async () => {
    if (!agentId) {
      setEditLocked(false);
      setActiveCampaignsCount(0);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id,status')
        .eq('agent_id', agentId)
        .in('status', ['scheduled', 'active', 'paused']);

      if (error) throw error;
      
      const count = data?.length || 0;
      setActiveCampaignsCount(count);
      setEditLocked(count > 0);
    } catch (err) {
      // Silent fail - non-critical feature
    }
  };

  return {
    isEditMode,
    editLocked,
    activeCampaignsCount,
    existingAgent,
    loading,
    checkActiveCampaigns
  };
}
