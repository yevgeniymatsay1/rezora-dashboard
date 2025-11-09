import { UseQueryOptions } from '@tanstack/react-query';

/**
 * Cache strategies for different data types
 * Based on data volatility and update frequency
 */

// Time constants
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/**
 * Cache strategy presets for different data types
 */
export const cacheStrategies = {
  // Static data that rarely changes
  static: {
    staleTime: 24 * HOUR, // 24 hours
    gcTime: 7 * 24 * HOUR, // 7 days
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  },
  
  // Semi-static data (agent templates, voice options, etc.)
  semiStatic: {
    staleTime: 1 * HOUR, // 1 hour
    gcTime: 24 * HOUR, // 24 hours
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  },
  
  // User-specific configuration data (agents, settings)
  userConfig: {
    staleTime: 5 * MINUTE, // 5 minutes
    gcTime: 30 * MINUTE, // 30 minutes
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  },
  
  // Frequently updated data (campaigns, contacts)
  dynamic: {
    staleTime: 1 * MINUTE, // 1 minute
    gcTime: 10 * MINUTE, // 10 minutes
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  },
  
  // Real-time or near real-time data (call status, credits)
  realtime: {
    staleTime: 10 * SECOND, // 10 seconds
    gcTime: 1 * MINUTE, // 1 minute
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 30 * SECOND, // Poll every 30 seconds
  },
  
  // No cache (always fresh)
  noCache: {
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  },
} as const;

/**
 * Get cache strategy for specific data types
 */
export function getCacheStrategy(dataType: keyof typeof cacheStrategies): Partial<UseQueryOptions> {
  return cacheStrategies[dataType];
}

/**
 * Data type mappings for automatic cache strategy selection
 */
export const dataTypeMappings = {
  // Static data
  'agent-templates': 'static',
  'voice-options': 'static',
  'credit-packages': 'static',
  
  // Semi-static data
  'phone-numbers-available': 'semiStatic',
  'retell-voices': 'semiStatic',
  
  // User configuration
  'user-agents': 'userConfig',
  'user-settings': 'userConfig',
  'user-profile': 'userConfig',
  'phone-numbers': 'userConfig',
  
  // Dynamic data
  'campaigns': 'dynamic',
  'contacts': 'dynamic',
  'contact-groups': 'dynamic',
  'campaign-results': 'dynamic',
  
  // Real-time data
  'active-calls': 'realtime',
  'user-credits': 'realtime',
  'campaign-status': 'realtime',
  
  // Analytics
  'dashboard-stats': 'analytics',
  'campaign-analytics': 'analytics',
  'call-analytics': 'analytics',
  
  // No cache
  'webhook-status': 'noCache',
  'auth-session': 'noCache',
} as const;

/**
 * Get cache strategy by data type name
 */
export function getCacheStrategyByType(type: string): Partial<UseQueryOptions> {
  const mappedType = dataTypeMappings[type as keyof typeof dataTypeMappings];
  if (mappedType) {
    return getCacheStrategy(mappedType as keyof typeof cacheStrategies);
  }
  // Default to dynamic cache strategy
  return cacheStrategies.dynamic;
}

/**
 * Intelligent cache invalidation based on mutation type
 */
export const invalidationRules = {
  // When an agent is created/updated/deleted
  agentMutation: [
    'user-agents',
    'dashboard-stats',
  ],
  
  // When a campaign is created/updated/deleted
  campaignMutation: [
    'campaigns',
    'campaign-status',
    'dashboard-stats',
    'campaign-analytics',
  ],
  
  // When contacts are imported/updated/deleted
  contactMutation: [
    'contacts',
    'contact-groups',
    'dashboard-stats',
  ],
  
  // When a call is made
  callMutation: [
    'active-calls',
    'campaign-results',
    'call-analytics',
    'user-credits',
  ],
  
  // When credits are purchased/used
  creditMutation: [
    'user-credits',
    'credit-transactions',
  ],
  
  // When phone numbers are purchased/released
  phoneNumberMutation: [
    'phone-numbers',
    'phone-numbers-available',
  ],
};

/**
 * Get queries to invalidate based on mutation type
 */
export function getInvalidationKeys(mutationType: keyof typeof invalidationRules): string[] {
  return invalidationRules[mutationType] || [];
}

/**
 * Prefetch strategies for common user flows
 */
export const prefetchStrategies = {
  // When user enters agents page
  agentsPage: [
    'agent-templates',
    'user-agents',
    'phone-numbers',
    'voice-options',
  ],
  
  // When user enters campaigns page
  campaignsPage: [
    'campaigns',
    'user-agents',
    'contact-groups',
  ],
  
  // When user enters contacts page
  contactsPage: [
    'contact-groups',
    'contacts',
  ],
  
  // When user enters billing page
  billingPage: [
    'user-credits',
    'credit-transactions',
    'credit-packages',
  ],
  
  // When user enters analytics page
  analyticsPage: [
    'dashboard-stats',
    'campaign-analytics',
    'call-analytics',
  ],
};

/**
 * Get queries to prefetch for a specific page
 */
export function getPrefetchQueries(page: keyof typeof prefetchStrategies): string[] {
  return prefetchStrategies[page] || [];
}