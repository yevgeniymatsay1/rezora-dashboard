// @ts-nocheck
import { QueryClient, DefaultOptions, UseMutationOptions, UseQueryOptions } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { cacheStrategies } from './cache-strategies';

// Default options for React Query
const defaultOptions: DefaultOptions = {
  queries: {
    // Use dynamic cache strategy as default
    ...cacheStrategies.dynamic,
    // Retry failed requests 3 times
    retry: (failureCount, error: any) => {
      // Don't retry on 4xx errors
      if (error?.status >= 400 && error?.status < 500) {
        return false;
      }
      // Retry up to 3 times for other errors
      return failureCount < 3;
    },
    // Retry delay with exponential backoff
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    // Refetch on window focus in production
    refetchOnWindowFocus: process.env.NODE_ENV === 'production',
    // Don't refetch on reconnect by default
    refetchOnReconnect: 'always',
  },
  mutations: {
    // Retry mutations once
    retry: 1,
    // Show error toast on mutation failure
    onError: (error: any) => {
      const message = error?.message || 'An error occurred. Please try again.';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    },
  },
};

// Create the query client instance
export const queryClient = new QueryClient({
  defaultOptions,
});

// Query key factory for consistent key generation
export const queryKeys = {
  all: ['app'] as const,
  auth: {
    all: ['auth'] as const,
    user: () => [...queryKeys.auth.all, 'user'] as const,
    session: () => [...queryKeys.auth.all, 'session'] as const,
  },
  agents: {
    all: ['agents'] as const,
    lists: () => [...queryKeys.agents.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.agents.lists(), filters] as const,
    details: () => [...queryKeys.agents.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.agents.details(), id] as const,
    templates: () => [...queryKeys.agents.all, 'templates'] as const,
  },
  campaigns: {
    all: ['campaigns'] as const,
    lists: () => [...queryKeys.campaigns.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.campaigns.lists(), filters] as const,
    details: () => [...queryKeys.campaigns.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.campaigns.details(), id] as const,
    results: (id: string) => [...queryKeys.campaigns.detail(id), 'results'] as const,
  },
  contacts: {
    all: ['contacts'] as const,
    lists: () => [...queryKeys.contacts.all, 'list'] as const,
    list: (groupId?: string) => [...queryKeys.contacts.lists(), { groupId }] as const,
    groups: () => [...queryKeys.contacts.all, 'groups'] as const,
    group: (id: string) => [...queryKeys.contacts.groups(), id] as const,
  },
  calls: {
    all: ['calls'] as const,
    lists: () => [...queryKeys.calls.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.calls.lists(), filters] as const,
    detail: (id: string) => [...queryKeys.calls.all, id] as const,
    recordings: () => [...queryKeys.calls.all, 'recordings'] as const,
  },
  billing: {
    all: ['billing'] as const,
    credits: () => [...queryKeys.billing.all, 'credits'] as const,
    transactions: () => [...queryKeys.billing.all, 'transactions'] as const,
    packages: () => [...queryKeys.billing.all, 'packages'] as const,
  },
  phoneNumbers: {
    all: ['phoneNumbers'] as const,
    lists: () => [...queryKeys.phoneNumbers.all, 'list'] as const,
    available: (areaCode?: string) => [...queryKeys.phoneNumbers.all, 'available', areaCode] as const,
  },
  settings: {
    all: ['settings'] as const,
    profile: () => [...queryKeys.settings.all, 'profile'] as const,
    notifications: () => [...queryKeys.settings.all, 'notifications'] as const,
    apiKeys: () => [...queryKeys.settings.all, 'apiKeys'] as const,
  },
};

// Helper function to invalidate queries
export const invalidateQueries = async (keys: readonly unknown[]) => {
  await queryClient.invalidateQueries({ queryKey: keys });
};

// Helper function to prefetch queries
export const prefetchQuery = async <TData = unknown>(
  options: UseQueryOptions<TData>
) => {
  await queryClient.prefetchQuery(options);
};

// Helper function to set query data
export const setQueryData = <TData = unknown>(
  queryKey: readonly unknown[],
  data: TData | ((oldData: TData | undefined) => TData)
) => {
  queryClient.setQueryData(queryKey, data);
};

// Helper function to get query data
export const getQueryData = <TData = unknown>(
  queryKey: readonly unknown[]
): TData | undefined => {
  return queryClient.getQueryData<TData>(queryKey);
};

// Custom mutation options with optimistic updates
export function createOptimisticMutation<TData = unknown, TVariables = unknown>(
  options: UseMutationOptions<TData, Error, TVariables> & {
    invalidateKeys?: readonly unknown[][];
    optimisticUpdate?: (variables: TVariables) => void;
    rollback?: (context: any) => void;
  }
): UseMutationOptions<TData, Error, TVariables> {
  return {
    ...options,
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      if (options.invalidateKeys) {
        await Promise.all(
          options.invalidateKeys.map(key => 
            queryClient.cancelQueries({ queryKey: key })
          )
        );
      }

      // Optimistic update
      const context = options.optimisticUpdate?.(variables);

      // Call original onMutate if provided
      if (options.onMutate) {
        return await options.onMutate(variables);
      }

    return context;
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (options.rollback && context) {
        options.rollback(context);
      }

      // Call original onError if provided
      if (options.onError) {
        options.onError(error, variables, context);
      }
    },
    onSettled: async (data, error, variables, context) => {
      // Invalidate queries
      if (options.invalidateKeys) {
        await Promise.all(
          options.invalidateKeys.map(key => 
            queryClient.invalidateQueries({ queryKey: key })
          )
        );
      }

      // Call original onSettled if provided
      if (options.onSettled) {
        await options.onSettled(data, error, variables, context);
      }
    },
    onSuccess: (data, variables, context) => {
      // Show success toast if not disabled
      if (!options.meta?.skipSuccessToast) {
        toast({
          title: 'Success',
          description: options.meta?.successMessage || 'Operation completed successfully.',
        });
      }

      // Call original onSuccess if provided
      if (options.onSuccess) {
        options.onSuccess(data, variables, context);
      }
    },
  };
}

// Export configured query client
export default queryClient;