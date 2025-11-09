/**
 * Shared utility for retrieving user-specific or global Retell API keys
 * This module provides a centralized way to get the appropriate API key for Retell operations
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface ApiKeyResult {
  apiKey: string;
  source: 'user' | 'global';
  userId?: string;
}

/**
 * Retrieves the appropriate Retell API key for a user
 * Falls back to global RETELL_API_KEY if user doesn't have a personal key
 * 
 * @param userId - The user ID to get the API key for
 * @returns Promise resolving to ApiKeyResult with the key and its source
 * @throws Error if no API key is available from either source
 */
export async function getRetellApiKey(userId: string): Promise<ApiKeyResult> {
  console.log(`🔑 Getting Retell API key for user: ${userId}`);
  
  try {
    // Create service role client to query the database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Try to get user-specific API key first
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('retell_api_key')
      .eq('id', userId)
      .single();

    if (error) {
      console.warn(`⚠️ Failed to fetch user profile for API key: ${error.message}`);
    } else if (profile?.retell_api_key) {
      console.log(`✅ Using user-specific Retell API key for user: ${userId}`);
      return {
        apiKey: profile.retell_api_key,
        source: 'user',
        userId: userId
      };
    }

    // Fall back to global API key
    const globalApiKey = Deno.env.get('RETELL_API_KEY');
    if (!globalApiKey) {
      throw new Error('No Retell API key available - neither user-specific nor global key found');
    }

    console.log(`🌍 Using global Retell API key for user: ${userId}`);
    return {
      apiKey: globalApiKey,
      source: 'global',
      userId: userId
    };

  } catch (error) {
    console.error(`❌ Error retrieving Retell API key for user ${userId}:`, error);
    throw new Error(`Failed to retrieve Retell API key: ${error.message}`);
  }
}

/**
 * Retrieves the global Retell API key (for webhook handlers and system operations)
 * 
 * @returns Promise resolving to ApiKeyResult with the global key
 * @throws Error if global API key is not configured
 */
export async function getGlobalRetellApiKey(): Promise<ApiKeyResult> {
  console.log('🌍 Getting global Retell API key');
  
  const globalApiKey = Deno.env.get('RETELL_API_KEY');
  if (!globalApiKey) {
    throw new Error('Global RETELL_API_KEY environment variable is not configured');
  }

  return {
    apiKey: globalApiKey,
    source: 'global'
  };
}

/**
 * Utility function to check if an API key is valid format
 * @param apiKey - The API key to validate
 * @returns boolean indicating if the key appears to be valid
 */
export function isValidApiKeyFormat(apiKey: string): boolean {
  // Basic validation - Retell API keys typically start with specific prefixes
  // This is a basic check, actual validation would require API call
  return apiKey && apiKey.length > 10 && typeof apiKey === 'string';
}

/**
 * Helper function for edge functions to get API key with proper error handling
 * @param userId - The user ID (optional for webhook handlers)
 * @returns Promise resolving to the API key string
 */
export async function getRetellApiKeyForFunction(userId?: string): Promise<string> {
  try {
    if (userId) {
      const result = await getRetellApiKey(userId);
      return result.apiKey;
    } else {
      const result = await getGlobalRetellApiKey();
      return result.apiKey;
    }
  } catch (error) {
    console.error('Failed to get Retell API key:', error);
    throw error;
  }
}