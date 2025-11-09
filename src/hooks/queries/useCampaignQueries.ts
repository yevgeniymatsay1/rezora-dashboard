// @ts-nocheck
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { campaignsService } from '@/services/campaigns.service';
import { useToast } from '@/hooks/use-toast';

// Query keys
export const campaignKeys = {
  all: ['campaigns'] as const,
  lists: () => [...campaignKeys.all, 'list'] as const,
  list: (filters?: any) => [...campaignKeys.lists(), filters] as const,
  details: () => [...campaignKeys.all, 'detail'] as const,
  detail: (id: string) => [...campaignKeys.details(), id] as const,
  metrics: (id: string) => [...campaignKeys.all, 'metrics', id] as const,
};

/**
 * Hook to fetch all campaigns
 */
export function useCampaigns() {
  return useQuery({
    queryKey: campaignKeys.lists(),
    queryFn: () => campaignsService.getAll(),
    staleTime: 30000, // Consider data stale after 30 seconds
    cacheTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  });
}

/**
 * Hook to fetch a single campaign
 */
export function useCampaign(campaignId: string | undefined) {
  return useQuery({
    queryKey: campaignKeys.detail(campaignId!),
    queryFn: () => campaignsService.getById(campaignId!),
    enabled: !!campaignId,
    staleTime: 30000,
  });
}

/**
 * Hook to fetch campaign metrics
 */
export function useCampaignMetrics(campaignId: string | undefined) {
  return useQuery({
    queryKey: campaignKeys.metrics(campaignId!),
    queryFn: () => campaignsService.getMetrics(campaignId!),
    enabled: !!campaignId,
    refetchInterval: 10000, // Refetch every 10 seconds for real-time updates
  });
}

/**
 * Hook to create a campaign
 */
export function useCreateCampaign() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: campaignsService.create,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: campaignKeys.lists() });
      toast({
        title: 'Campaign Created',
        description: 'Your campaign has been created successfully.',
      });
      return data;
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Create Campaign',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to update campaign status
 */
export function useUpdateCampaignStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ 
      campaignId, 
      status, 
      reason 
    }: { 
      campaignId: string; 
      status: any; 
      reason?: string;
    }) => campaignsService.updateStatus(campaignId, status, reason),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: campaignKeys.lists() });
      queryClient.invalidateQueries({ queryKey: campaignKeys.detail(variables.campaignId) });
      
      const statusMessages: Record<string, string> = {
        active: 'Campaign has been activated',
        paused: 'Campaign has been paused',
        completed: 'Campaign has been completed',
        cancelled: 'Campaign has been cancelled',
      };
      
      toast({
        title: 'Status Updated',
        description: statusMessages[variables.status] || 'Campaign status has been updated.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Update Status',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to delete a campaign
 */
export function useDeleteCampaign() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: campaignsService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: campaignKeys.lists() });
      toast({
        title: 'Campaign Deleted',
        description: 'The campaign has been deleted successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Delete Campaign',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to check credits for campaign
 */
export function useCheckCampaignCredits() {
  return useMutation({
    mutationFn: (estimatedCost: number) => 
      campaignsService.checkCreditsForCampaign(estimatedCost),
  });
}