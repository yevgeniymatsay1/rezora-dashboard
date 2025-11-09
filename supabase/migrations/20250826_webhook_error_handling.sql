-- Webhook error tracking table for Epic #104 Issue #6

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
  resolved_at TIMESTAMPTZ
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_webhook_errors_event_id 
  ON webhook_errors(event_id);

CREATE INDEX IF NOT EXISTS idx_webhook_errors_next_retry 
  ON webhook_errors(next_retry_at) 
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_errors_created 
  ON webhook_errors(created_at);

CREATE INDEX IF NOT EXISTS idx_webhook_errors_unresolved
  ON webhook_errors(resolved_at)
  WHERE resolved_at IS NULL;

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

-- Create a scheduled job to clean up old errors (requires pg_cron extension)
-- This would be set up in Supabase dashboard or via extension
-- SELECT cron.schedule('cleanup-webhook-errors', '0 3 * * *', 'SELECT cleanup_old_webhook_errors();');

-- Function for atomic webhook processing with error handling
CREATE OR REPLACE FUNCTION process_webhook_with_retry(
  p_webhook_type TEXT,
  p_event_type TEXT,
  p_event_id TEXT,
  p_payload JSONB,
  p_operation TEXT
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_error TEXT;
BEGIN
  -- Try to execute the operation
  BEGIN
    -- This would execute the specific webhook operation
    -- For now, returning success placeholder
    v_result := jsonb_build_object(
      'success', true,
      'event_id', p_event_id,
      'processed_at', NOW()
    );
    
    -- Mark any previous error as resolved
    UPDATE webhook_errors
    SET resolved_at = NOW()
    WHERE event_id = p_event_id
      AND resolved_at IS NULL;
    
    RETURN v_result;
  EXCEPTION
    WHEN OTHERS THEN
      -- Log the error
      v_error := SQLERRM;
      
      INSERT INTO webhook_errors (
        webhook_type,
        event_type,
        event_id,
        payload,
        error_message,
        error_stack,
        next_retry_at
      ) VALUES (
        p_webhook_type,
        p_event_type,
        p_event_id,
        p_payload,
        v_error,
        v_error,
        NOW() + INTERVAL '1 minute'
      )
      ON CONFLICT (event_id) DO UPDATE
      SET 
        retry_count = webhook_errors.retry_count + 1,
        error_message = v_error,
        next_retry_at = CASE 
          WHEN webhook_errors.retry_count < webhook_errors.max_retries 
          THEN NOW() + (INTERVAL '1 minute' * POWER(2, webhook_errors.retry_count))
          ELSE NULL
        END;
      
      RETURN jsonb_build_object(
        'success', false,
        'error', v_error,
        'event_id', p_event_id
      );
  END;
END;
$$ LANGUAGE plpgsql;

-- Function to process error queue
CREATE OR REPLACE FUNCTION process_webhook_error_queue()
RETURNS TABLE(
  event_id TEXT,
  retry_success BOOLEAN
) AS $$
DECLARE
  v_error RECORD;
BEGIN
  FOR v_error IN 
    SELECT * FROM webhook_errors
    WHERE resolved_at IS NULL
      AND next_retry_at IS NOT NULL
      AND next_retry_at <= NOW()
      AND retry_count < max_retries
    ORDER BY created_at
    LIMIT 10
  LOOP
    -- Process each error
    -- This would call the appropriate webhook handler
    -- For now, returning placeholder
    event_id := v_error.event_id;
    retry_success := false;
    
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Add monitoring view for webhook errors
CREATE OR REPLACE VIEW webhook_error_stats AS
SELECT 
  webhook_type,
  event_type,
  COUNT(*) as total_errors,
  COUNT(CASE WHEN resolved_at IS NOT NULL THEN 1 END) as resolved_errors,
  COUNT(CASE WHEN resolved_at IS NULL THEN 1 END) as unresolved_errors,
  AVG(retry_count) as avg_retries,
  MAX(created_at) as last_error_at
FROM webhook_errors
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY webhook_type, event_type;