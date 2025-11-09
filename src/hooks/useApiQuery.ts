// @ts-nocheck
import { useQuery, useMutation, UseQueryOptions, UseMutationOptions, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys, invalidateQueries } from '@/lib/queryClient';
import { enhancedFetch } from '@/services/networkHandler';
import { useAuth } from '@/contexts/AuthContext';
import { Agent, Campaign, Contact } from '@/types';
import { getCacheStrategy, getInvalidationKeys } from '@/lib/cache-strategies';
import { useToast } from '@/hooks/use-toast';

interface FilterOptions {
  status?: string;
  [key: string]: unknown;
}

interface AgentCreateData {
  name: string;
  template_id: string;
  customizations?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

interface CampaignCreateData {
  name: string;
  agent_id: string;
  contact_group_id: string;
  status: string;
  timezone: string;
  start_date?: string;
  end_date?: string;
  daily_start_time: string;
  daily_end_time: string;
  max_concurrent_calls: number;
  retry_attempts: number;
  retry_interval: number;
  active_days: number[];
}

interface ContactImportData {
  group_id: string;
  contacts: Array<Record<string, unknown>>;
}

// Generic API query hook
export function useApiQuery<TData = unknown>(
  key: readonly unknown[],
  queryFn: () => Promise<TData>,
  options?: Omit<UseQueryOptions<TData>, 'queryKey' | 'queryFn'>
) {
  const { session } = useAuth();
  
  return useQuery({
    queryKey: key,
    queryFn,
    enabled: !!session && (options?.enabled !== false),
    ...options,
  });
}

// Agents hooks
export function useAgents(filters?: FilterOptions) {
  return useApiQuery(
    queryKeys.agents.list(filters),
    async () => {
      const query = supabase.from('user_agents').select('*').order('created_at', { ascending: false });
      
      if (filters?.status) {
        query.eq('status', filters.status);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    getCacheStrategy('userConfig')
  );
}

export function useAgent(id: string) {
  return useApiQuery(
    queryKeys.agents.detail(id),
    async () => {
      const { data, error } = await supabase
        .from('user_agents')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    },
    {
      enabled: !!id,
    }
  );
}

export function useAgentTemplates() {
  return useApiQuery(
    queryKeys.agents.templates(),
    async () => {
      const { data, error } = await supabase
        .from('agent_templates')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    },
    getCacheStrategy('static') // Templates rarely change
  );
}

// Campaigns hooks
export function useCampaigns(filters?: FilterOptions) {
  return useApiQuery(
    queryKeys.campaigns.list(filters),
    async () => {
      const query = supabase
        .from('campaigns')
        .select(`
          *,
          user_agents(name),
          contact_groups(name)
        `)
        .order('created_at', { ascending: false });
      
      if (filters?.status) {
        query.eq('status', filters.status);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    getCacheStrategy('dynamic') // Campaigns update frequently
  );
}

export function useCampaign(id: string) {
  return useApiQuery(
    queryKeys.campaigns.detail(id),
    async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select(`
          *,
          user_agents(*),
          contact_groups(*)
        `)
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    },
    {
      enabled: !!id,
    }
  );
}

export function useCampaignResults(campaignId: string) {
  return useApiQuery(
    queryKeys.campaigns.results(campaignId),
    async () => {
      const { data, error } = await supabase
        .from('campaign_contact_attempts')
        .select(`
          *,
          contacts(*)
        `)
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    {
      enabled: !!campaignId,
      ...getCacheStrategy('dynamic'), // Campaign results update frequently
    }
  );
}

// Contacts hooks
export function useContactGroups() {
  return useApiQuery(
    queryKeys.contacts.groups(),
    async () => {
      const { data, error } = await supabase
        .from('contact_groups')
        .select('*, contacts(count)')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    getCacheStrategy('dynamic') // Contact groups can change frequently
  );
}

export function useContacts(groupId?: string, options?: Omit<UseQueryOptions<any>, 'queryKey' | 'queryFn'>) {
  return useApiQuery(
    queryKeys.contacts.list(groupId),
    async () => {
      const query = supabase.from('contacts').select('*');
      
      if (groupId) {
        query.eq('contact_group_id', groupId);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    options
  );
}

// Billing hooks
export function useCredits() {
  return useApiQuery(
    queryKeys.billing.credits(),
    async () => {
      const { data, error } = await supabase
        .from('user_credits')
        .select('*')
        .single();
      
      if (error) throw error;
      return data;
    },
    getCacheStrategy('realtime') // Credits need real-time updates
  );
}

export function useCreditTransactions() {
  return useApiQuery(
    queryKeys.billing.transactions(),
    async () => {
      const { data, error } = await supabase
        .from('credit_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data;
    },
    getCacheStrategy('dynamic') // Transactions need fairly fresh data
  );
}

// Phone numbers hooks
export function usePhoneNumbers() {
  return useApiQuery(
    queryKeys.phoneNumbers.lists(),
    async () => {
      const { data, error } = await supabase
        .from('phone_numbers')
        .select(`
          *,
          user_agents(name)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    getCacheStrategy('userConfig') // Phone numbers are user config
  );
}

// Analytics hooks
export function useDashboardAnalytics() {
  return useApiQuery(
    queryKeys.analytics.dashboard(),
    async () => {
      // Fetch multiple analytics data points in parallel
      const [campaigns, calls, credits] = await Promise.all([
        supabase.from('campaigns').select('status', { count: 'exact' }),
        supabase.from('call_records').select('status', { count: 'exact' }),
        supabase.from('user_credits').select('balance_cents').single(),
      ]);
      
      return {
        totalCampaigns: campaigns.count || 0,
        totalCalls: calls.count || 0,
        creditsBalance: credits.data?.balance_cents || 0,
      };
    },
    getCacheStrategy('analytics') // Analytics can be cached for a few minutes
  );
}

// Mutation hooks with optimistic updates
export function useCreateAgent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: AgentCreateData) => {
      const response = await enhancedFetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) throw new Error('Failed to create agent');
      return response.json();
    },
    onMutate: async (newAgent) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.agents.all });
      
      // Snapshot previous value
      const previousAgents = queryClient.getQueryData(queryKeys.agents.lists());
      
      // Optimistically update to the new value
      queryClient.setQueryData(queryKeys.agents.lists(), (old: any[]) => [
        {
          ...newAgent,
          id: `temp-${Date.now()}`,
          status: 'creating',
          created_at: new Date().toISOString(),
        },
        ...(old || [])
      ]);
      
      return { previousAgents };
    },
    onError: (err, newAgent, context) => {
      // Rollback on error
      if (context?.previousAgents) {
        queryClient.setQueryData(queryKeys.agents.lists(), context.previousAgents);
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.all });
    },
  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AgentCreateData> }) => {
      const response = await enhancedFetch(`/api/agents/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) throw new Error('Failed to update agent');
      return response.json();
    },
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.agents.detail(id) });
      await queryClient.cancelQueries({ queryKey: queryKeys.agents.lists() });
      
      // Snapshot previous values
      const previousAgent = queryClient.getQueryData(queryKeys.agents.detail(id));
      const previousAgents = queryClient.getQueryData(queryKeys.agents.lists());
      
      // Optimistically update the agent
      queryClient.setQueryData(queryKeys.agents.detail(id), (old: any) => ({
        ...old,
        ...data,
      }));
      
      // Also update in the list
      queryClient.setQueryData(queryKeys.agents.lists(), (old: any[]) => 
        old?.map((agent: any) => agent.id === id ? { ...agent, ...data } : agent)
      );
      
      return { previousAgent, previousAgents };
    },
    onError: (err, { id }, context) => {
      // Rollback on error
      if (context?.previousAgent) {
        queryClient.setQueryData(queryKeys.agents.detail(id), context.previousAgent);
      }
      if (context?.previousAgents) {
        queryClient.setQueryData(queryKeys.agents.lists(), context.previousAgents);
      }
    },
    onSettled: (_, __, { id }) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.lists() });
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await enhancedFetch(`/api/agents/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Failed to delete agent');
      return response.json();
    },
    onMutate: async (id) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.agents.all });
      
      // Snapshot previous value
      const previousAgents = queryClient.getQueryData(queryKeys.agents.lists());
      
      // Optimistically remove the agent
      queryClient.setQueryData(queryKeys.agents.lists(), (old: any[]) => 
        old?.filter((agent: any) => agent.id !== id)
      );
      
      return { previousAgents };
    },
    onError: (err, id, context) => {
      // Rollback on error
      if (context?.previousAgents) {
        queryClient.setQueryData(queryKeys.agents.lists(), context.previousAgents);
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.all });
    },
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: CampaignCreateData) => {
      const { data: campaign, error } = await supabase
        .from('campaigns')
        .insert(data)
        .select()
        .single();
      
      if (error) throw error;
      return campaign;
    },
    onMutate: async (newCampaign) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.campaigns.all });
      
      // Snapshot previous value
      const previousCampaigns = queryClient.getQueryData(queryKeys.campaigns.lists());
      
      // Optimistically add the new campaign
      queryClient.setQueryData(queryKeys.campaigns.lists(), (old: any[]) => [
        {
          ...newCampaign,
          id: `temp-${Date.now()}`,
          created_at: new Date().toISOString(),
          status: 'draft',
        },
        ...(old || [])
      ]);
      
      return { previousCampaigns };
    },
    onError: (err, newCampaign, context) => {
      // Rollback on error
      if (context?.previousCampaigns) {
        queryClient.setQueryData(queryKeys.campaigns.lists(), context.previousCampaigns);
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all });
    },
  });
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CampaignCreateData> }) => {
      const { data: campaign, error } = await supabase
        .from('campaigns')
        .update(data)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return campaign;
    },
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.campaigns.detail(id) });
      await queryClient.cancelQueries({ queryKey: queryKeys.campaigns.lists() });
      
      // Snapshot previous values
      const previousCampaign = queryClient.getQueryData(queryKeys.campaigns.detail(id));
      const previousCampaigns = queryClient.getQueryData(queryKeys.campaigns.lists());
      
      // Optimistically update the campaign
      queryClient.setQueryData(queryKeys.campaigns.detail(id), (old: any) => ({
        ...old,
        ...data,
      }));
      
      // Also update in the list
      queryClient.setQueryData(queryKeys.campaigns.lists(), (old: any[]) => 
        old?.map((campaign: any) => campaign.id === id ? { ...campaign, ...data } : campaign)
      );
      
      return { previousCampaign, previousCampaigns };
    },
    onError: (err, { id }, context) => {
      // Rollback on error
      if (context?.previousCampaign) {
        queryClient.setQueryData(queryKeys.campaigns.detail(id), context.previousCampaign);
      }
      if (context?.previousCampaigns) {
        queryClient.setQueryData(queryKeys.campaigns.lists(), context.previousCampaigns);
      }
    },
    onSettled: (_, __, { id }) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.lists() });
    },
  });
}

export function useImportContacts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (data: ContactImportData) => {
      const response = await enhancedFetch('/api/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) throw new Error('Failed to import contacts');
      return response.json();
    },
    onMutate: async (data) => {
      // Show optimistic toast
      toast({
        title: 'Importing contacts...',
        description: `Importing ${data.contacts.length} contacts`,
      });
      
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.contacts.all });
      
      // Snapshot previous value
      const previousGroups = queryClient.getQueryData(queryKeys.contacts.groups());
      
      // Optimistically update the contact group count
      queryClient.setQueryData(queryKeys.contacts.groups(), (old: any[]) => 
        old?.map((group: any) => 
          group.id === data.group_id 
            ? { ...group, contacts: [{ count: (group.contacts?.[0]?.count || 0) + data.contacts.length }] }
            : group
        )
      );
      
      return { previousGroups };
    },
    onError: (err, data, context) => {
      // Rollback on error
      if (context?.previousGroups) {
        queryClient.setQueryData(queryKeys.contacts.groups(), context.previousGroups);
      }
      
      toast({
        title: 'Import failed',
        description: 'Failed to import contacts. Please try again.',
        variant: 'destructive',
      });
    },
    onSuccess: (result) => {
      toast({
        title: 'Import successful',
        description: `Successfully imported ${result.count || 0} contacts`,
      });
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
    },
  });
}