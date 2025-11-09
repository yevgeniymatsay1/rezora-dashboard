// @ts-nocheck
import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';

/**
 * Idempotency handling for API operations
 */

interface IdempotencyRecord {
  id: string;
  key: string;
  operation: string;
  request_hash: string;
  response?: any;
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
  expires_at: string;
}

/**
 * Generate idempotency key for an operation
 */
export function generateIdempotencyKey(
  operation: string,
  ...params: any[]
): string {
  const paramString = JSON.stringify(params);
  const hash = btoa(paramString).replace(/[^a-zA-Z0-9]/g, '');
  return `${operation}_${hash}_${Date.now()}`;
}

/**
 * Create request hash for deduplication
 */
export function createRequestHash(data: any): string {
  const normalized = JSON.stringify(data, Object.keys(data).sort());
  return btoa(normalized);
}

/**
 * Check if an operation has been performed recently
 */
export async function checkIdempotency(
  operation: string,
  requestHash: string,
  windowMinutes: number = 5
): Promise<IdempotencyRecord | null> {
  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('idempotency_records')
    .select('*')
    .eq('operation', operation)
    .eq('request_hash', requestHash)
    .gte('created_at', cutoff)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  return data as IdempotencyRecord;
}

/**
 * Store idempotency record
 */
export async function storeIdempotencyRecord(
  key: string,
  operation: string,
  requestHash: string,
  response?: any
): Promise<void> {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  
  await supabase
    .from('idempotency_records')
    .upsert({
      key,
      operation,
      request_hash: requestHash,
      response,
      status: response ? 'completed' : 'pending',
      expires_at: expiresAt
    });
}

/**
 * Idempotent API call wrapper
 */
export async function idempotentCall<T>(
  operation: string,
  apiCall: () => Promise<T>,
  params: any,
  options: {
    windowMinutes?: number;
    retryOnFailure?: boolean;
  } = {}
): Promise<T> {
  const { windowMinutes = 5, retryOnFailure = true } = options;
  
  // Create request hash
  const requestHash = createRequestHash(params);
  
  // Check for existing operation
  const existing = await checkIdempotency(operation, requestHash, windowMinutes);
  
  if (existing) {
    if (existing.status === 'completed' && existing.response) {
      console.log(`Returning cached result for ${operation}`);
      return existing.response as T;
    }
    
    if (existing.status === 'failed' && !retryOnFailure) {
      throw new Error(`Operation ${operation} previously failed`);
    }
    
    if (existing.status === 'pending') {
      // Wait for pending operation to complete
      return waitForOperation<T>(existing.key);
    }
  }
  
  // Generate new idempotency key
  const key = generateIdempotencyKey(operation, params);
  
  // Store pending record
  await storeIdempotencyRecord(key, operation, requestHash);
  
  try {
    // Execute API call
    const result = await apiCall();
    
    // Store successful result
    await storeIdempotencyRecord(key, operation, requestHash, result);
    
    return result;
  } catch (error) {
    // Mark as failed
    await supabase
      .from('idempotency_records')
      .update({ status: 'failed' })
      .eq('key', key);
    
    throw error;
  }
}

/**
 * Wait for a pending operation to complete
 */
async function waitForOperation<T>(
  key: string,
  maxWaitMs: number = 30000
): Promise<T> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const { data } = await supabase
      .from('idempotency_records')
      .select('*')
      .eq('key', key)
      .single();
    
    if (data?.status === 'completed' && data.response) {
      return data.response as T;
    }
    
    if (data?.status === 'failed') {
      throw new Error(`Operation failed: ${key}`);
    }
    
    // Wait before checking again
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error(`Operation timed out: ${key}`);
}

/**
 * Retell AI specific idempotent operations
 */
export class RetellIdempotency {
  /**
   * Create agent with idempotency
   */
  static async createAgent(agentData: any): Promise<any> {
    return idempotentCall(
      'retell_create_agent',
      async () => {
        // Call Retell API to create agent
        const response = await fetch('/api/retell/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(agentData)
        });
        
        if (!response.ok) {
          throw new Error('Failed to create agent');
        }
        
        return response.json();
      },
      agentData,
      { windowMinutes: 10 }
    );
  }
  
  /**
   * Start call with idempotency
   */
  static async startCall(callData: any): Promise<any> {
    return idempotentCall(
      'retell_start_call',
      async () => {
        // Call Retell API to start call
        const response = await fetch('/api/retell/calls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(callData)
        });
        
        if (!response.ok) {
          throw new Error('Failed to start call');
        }
        
        return response.json();
      },
      callData,
      { windowMinutes: 1, retryOnFailure: false }
    );
  }
  
  /**
   * Update agent with idempotency
   */
  static async updateAgent(agentId: string, updates: any): Promise<any> {
    return idempotentCall(
      'retell_update_agent',
      async () => {
        // Call Retell API to update agent
        const response = await fetch(`/api/retell/agents/${agentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });
        
        if (!response.ok) {
          throw new Error('Failed to update agent');
        }
        
        return response.json();
      },
      { agentId, updates },
      { windowMinutes: 5 }
    );
  }
}

/**
 * Clean up expired idempotency records
 */
export async function cleanupIdempotencyRecords(): Promise<void> {
  const { error } = await supabase
    .from('idempotency_records')
    .delete()
    .lt('expires_at', new Date().toISOString());
  
  if (error) {
    console.error('Failed to cleanup idempotency records:', error);
  }
}

/**
 * Migration to create idempotency table
 */
export const idempotencyTableMigration = `
CREATE TABLE IF NOT EXISTS idempotency_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  operation TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  
  CONSTRAINT status_check CHECK (status IN ('pending', 'completed', 'failed'))
);

CREATE INDEX idx_idempotency_operation_hash 
  ON idempotency_records(operation, request_hash);

CREATE INDEX idx_idempotency_expires 
  ON idempotency_records(expires_at);

CREATE INDEX idx_idempotency_key 
  ON idempotency_records(key);

-- Enable RLS
ALTER TABLE idempotency_records ENABLE ROW LEVEL SECURITY;

-- Policy for service role only
CREATE POLICY "Service role can manage idempotency records"
  ON idempotency_records
  FOR ALL
  TO service_role
  USING (true);
`;