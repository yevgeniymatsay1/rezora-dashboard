-- Add unique constraint on payment_intent_id for auto-reload idempotency
-- This prevents duplicate auto-reload processing if webhook retries
-- Complements the stripe_session_id constraint for manual purchases

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_payment_intent
ON credit_transactions((metadata->>'stripe_payment_intent_id'))
WHERE metadata->>'stripe_payment_intent_id' IS NOT NULL
AND type = 'purchase';

COMMENT ON INDEX idx_credit_transactions_payment_intent IS
'Prevents duplicate auto-reload credit additions from webhook retries. Uses payment_intent_id from metadata.';
