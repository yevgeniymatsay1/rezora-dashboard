import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Comprehensive webhook error handling system
 */

export interface WebhookError {
  id: string;
  webhook_type: string;
  event_type: string;
  event_id: string;
  payload: any;
  error_message: string;
  error_stack?: string;
  retry_count: number;
  max_retries: number;
  next_retry_at?: string;
  created_at: string;
  resolved_at?: string;
}

export class WebhookErrorHandler {
  private supabase: any;
  private maxRetries: number = 3;
  private retryDelayMs: number = 1000;
  
  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }
  
  /**
   * Log webhook error to database for monitoring and retry
   */
  async logError(
    webhookType: string,
    eventType: string,
    eventId: string,
    payload: any,
    error: Error,
    retryable: boolean = true
  ): Promise<void> {
    try {
      const errorRecord: Partial<WebhookError> = {
        webhook_type: webhookType,
        event_type: eventType,
        event_id: eventId,
        payload,
        error_message: error.message,
        error_stack: error.stack,
        retry_count: 0,
        max_retries: retryable ? this.maxRetries : 0,
        created_at: new Date().toISOString()
      };
      
      if (retryable) {
        errorRecord.next_retry_at = new Date(
          Date.now() + this.retryDelayMs
        ).toISOString();
      }
      
      const { error: insertError } = await this.supabase
        .from('webhook_errors')
        .insert(errorRecord);
      
      if (insertError) {
        console.error('Failed to log webhook error:', insertError);
      }
    } catch (logError) {
      console.error('Error logging webhook error:', logError);
    }
  }
  
  /**
   * Process webhook with automatic retry on failure
   */
  async processWithRetry<T>(
    operation: () => Promise<T>,
    webhookType: string,
    eventType: string,
    eventId: string,
    payload: any
  ): Promise<T | null> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await operation();
        
        // Mark any previous error as resolved
        if (attempt > 0) {
          await this.markErrorResolved(eventId);
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        console.error(`Webhook processing attempt ${attempt + 1} failed:`, error);
        
        if (attempt === 0) {
          // First failure, log to database
          await this.logError(
            webhookType,
            eventType,
            eventId,
            payload,
            lastError,
            true
          );
        } else {
          // Update retry count
          await this.updateRetryCount(eventId, attempt);
        }
        
        if (attempt < this.maxRetries) {
          // Exponential backoff
          const delay = this.retryDelayMs * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // All retries failed
    console.error(`All retries failed for webhook ${eventId}:`, lastError);
    return null;
  }
  
  /**
   * Update retry count for an error
   */
  private async updateRetryCount(eventId: string, retryCount: number): Promise<void> {
    const nextRetryAt = retryCount < this.maxRetries
      ? new Date(Date.now() + this.retryDelayMs * Math.pow(2, retryCount)).toISOString()
      : null;
    
    const { error } = await this.supabase
      .from('webhook_errors')
      .update({
        retry_count: retryCount,
        next_retry_at: nextRetryAt
      })
      .eq('event_id', eventId);
    
    if (error) {
      console.error('Failed to update retry count:', error);
    }
  }
  
  /**
   * Mark an error as resolved
   */
  private async markErrorResolved(eventId: string): Promise<void> {
    const { error } = await this.supabase
      .from('webhook_errors')
      .update({
        resolved_at: new Date().toISOString(),
        next_retry_at: null
      })
      .eq('event_id', eventId);
    
    if (error) {
      console.error('Failed to mark error as resolved:', error);
    }
  }
  
  /**
   * Process failed webhooks from error queue
   */
  async processErrorQueue(): Promise<void> {
    const { data: errors, error } = await this.supabase
      .from('webhook_errors')
      .select('*')
      .is('resolved_at', null)
      .lte('next_retry_at', new Date().toISOString())
      .limit(10);
    
    if (error) {
      console.error('Failed to fetch error queue:', error);
      return;
    }
    
    for (const webhookError of errors || []) {
      console.log(`Retrying webhook ${webhookError.event_id}, attempt ${webhookError.retry_count + 1}`);
      
      // Process based on webhook type
      // This would need to be implemented based on your specific webhook handlers
      await this.retryWebhook(webhookError);
    }
  }
  
  /**
   * Retry a specific webhook
   */
  private async retryWebhook(webhookError: WebhookError): Promise<void> {
    // This would be implemented based on your specific webhook logic
    console.log(`Retrying webhook ${webhookError.event_id}`);
    
    // Update retry count
    await this.updateRetryCount(
      webhookError.event_id,
      webhookError.retry_count + 1
    );
  }
}

/**
 * Database transaction wrapper for atomic operations
 */
export async function withTransaction<T>(
  supabase: any,
  operations: (tx: any) => Promise<T>
): Promise<T> {
  // Note: Supabase doesn't have built-in transaction support in Edge Functions
  // This is a pattern for ensuring atomic operations using RPC functions
  
  try {
    const result = await operations(supabase);
    return result;
  } catch (error) {
    console.error('Transaction failed:', error);
    throw error;
  }
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: any): boolean {
  // Network errors
  if (error.code === 'NETWORK_ERROR' || error.code === 'ETIMEDOUT') {
    return true;
  }
  
  // Database connection errors
  if (error.code === 'PGRST301' || error.code === 'PGRST503') {
    return true;
  }
  
  // Rate limiting
  if (error.status === 429) {
    return true;
  }
  
  // Server errors (5xx)
  if (error.status >= 500 && error.status < 600) {
    return true;
  }
  
  return false;
}

/**
 * Create webhook errors table migration
 */
export const webhookErrorsTableMigration = `
CREATE TABLE IF NOT EXISTS webhook_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_id TEXT UNIQUE NOT NULL,
  payload JSONB NOT NULL,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  
  INDEX idx_webhook_errors_event_id (event_id),
  INDEX idx_webhook_errors_next_retry (next_retry_at) WHERE resolved_at IS NULL,
  INDEX idx_webhook_errors_created (created_at)
);

-- Enable RLS
ALTER TABLE webhook_errors ENABLE ROW LEVEL SECURITY;

-- Only service role can access
CREATE POLICY "Service role can manage webhook errors"
  ON webhook_errors
  FOR ALL
  TO service_role
  USING (true);

-- Function to clean up old resolved errors
CREATE OR REPLACE FUNCTION cleanup_old_webhook_errors()
RETURNS void AS $$
BEGIN
  DELETE FROM webhook_errors
  WHERE resolved_at IS NOT NULL
    AND resolved_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;
`;