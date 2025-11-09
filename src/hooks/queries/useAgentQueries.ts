// @ts-nocheck
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentsService } from '@/services/agents.service';
import { useToast } from '@/hooks/use-toast';

// Query keys
export const agentKeys = {
  all: ['agents'] as const,
  lists: () => [...agentKeys.all, 'list'] as const,
  list: (filters?: any) => [...agentKeys.lists(), filters] as const,
  active: () => [...agentKeys.all, 'active'] as const,
  details: () => [...agentKeys.all, 'detail'] as const,
  detail: (id: string) => [...agentKeys.details(), id] as const,
  templates: () => [...agentKeys.all, 'templates'] as const,
  template: (id: string) => [...agentKeys.templates(), id] as const,
  canEdit: (id: string) => [...agentKeys.all, 'canEdit', id] as const,
};

/**
 * Hook to fetch all agents
 */
export function useAgents(includePhoneNumbers = true) {
  return useQuery({
    queryKey: agentKeys.list({ includePhoneNumbers }),
    queryFn: () => agentsService.getAll(includePhoneNumbers),
    staleTime: 30000,
    cacheTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch active agents only
 */
export function useActiveAgents() {
  return useQuery({
    queryKey: agentKeys.active(),
    queryFn: () => agentsService.getActive(),
    staleTime: 30000,
  });
}

/**
 * Hook to fetch a single agent
 */
export function useAgent(agentId: string | undefined) {
  return useQuery({
    queryKey: agentKeys.detail(agentId!),
    queryFn: () => agentsService.getById(agentId!),
    enabled: !!agentId,
    staleTime: 30000,
  });
}

/**
 * Hook to check if agent can be edited
 */
export function useCanEditAgent(agentId: string | undefined) {
  return useQuery({
    queryKey: agentKeys.canEdit(agentId!),
    queryFn: () => agentsService.canEdit(agentId!),
    enabled: !!agentId,
    staleTime: 10000, // Refresh more frequently as this can change
  });
}

/**
 * Hook to fetch agent templates
 */
export function useAgentTemplates() {
  return useQuery({
    queryKey: agentKeys.templates(),
    queryFn: () => agentsService.getTemplates(),
    staleTime: 60000, // Templates don't change often
    cacheTime: 10 * 60 * 1000,
  });
}

/**
 * Hook to fetch a single template
 */
export function useAgentTemplate(templateId: string | undefined) {
  return useQuery({
    queryKey: agentKeys.template(templateId!),
    queryFn: () => agentsService.getTemplateById(templateId!),
    enabled: !!templateId,
    staleTime: 60000,
  });
}

/**
 * Hook to create an agent
 */
export function useCreateAgent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: agentsService.create,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() });
      toast({
        title: 'Agent Created',
        description: 'Your agent has been created successfully.',
      });
      return data;
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Create Agent',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to update an agent
 */
export function useUpdateAgent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ 
      agentId, 
      updates 
    }: { 
      agentId: string; 
      updates: any;
    }) => agentsService.update(agentId, updates),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: agentKeys.detail(variables.agentId) });
      toast({
        title: 'Agent Updated',
        description: 'Your agent has been updated successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Update Agent',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to deploy an agent
 */
export function useDeployAgent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ 
      agentId, 
      phoneNumberId 
    }: { 
      agentId: string; 
      phoneNumberId: string;
    }) => agentsService.deploy(agentId, phoneNumberId),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: agentKeys.detail(variables.agentId) });
      queryClient.invalidateQueries({ queryKey: agentKeys.active() });
      toast({
        title: 'Agent Deployed',
        description: 'Your agent has been deployed successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Deploy Agent',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to archive an agent
 */
export function useArchiveAgent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: agentsService.archive,
    onSuccess: (data, agentId) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: agentKeys.detail(agentId) });
      queryClient.invalidateQueries({ queryKey: agentKeys.active() });
      toast({
        title: 'Agent Archived',
        description: 'The agent has been archived successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Archive Agent',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to delete an agent
 */
export function useDeleteAgent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: agentsService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: agentKeys.active() });
      toast({
        title: 'Agent Deleted',
        description: 'The agent has been deleted successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Delete Agent',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to create draft from template
 */
export function useCreateDraftFromTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: agentsService.createDraftFromTemplate,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() });
      toast({
        title: 'Draft Created',
        description: 'A draft agent has been created from the template.',
      });
      return data;
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Create Draft',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to test an agent
 */
export function useTestAgent() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ 
      agentId, 
      phoneNumber 
    }: { 
      agentId: string; 
      phoneNumber: string;
    }) => agentsService.testCall(agentId, phoneNumber),
    onSuccess: () => {
      toast({
        title: 'Test Call Initiated',
        description: 'The test call has been initiated. You should receive it shortly.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Initiate Test Call',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}