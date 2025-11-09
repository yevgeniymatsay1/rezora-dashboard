-- Bulletproof Credit Purchase System
-- Phase 1: Database Layer with Idempotency and Atomic Operations

-- 1. Add idempotency column to credit_transactions
ALTER TABLE credit_transactions
ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;

-- Create unique index to prevent duplicate processing
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_stripe_session
ON credit_transactions(stripe_session_id)
WHERE stripe_session_id IS NOT NULL;

-- 2. Create webhook event logging table for audit trail
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processing_result JSONB,
  CONSTRAINT unique_stripe_event_id UNIQUE(event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON stripe_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON stripe_webhook_events(processed_at);

-- 3. Create atomic credit purchase function
-- This function handles the entire credit purchase in a single transaction
-- Prevents race conditions, duplicates, and partial failures
CREATE OR REPLACE FUNCTION process_credit_purchase(
  p_user_id UUID,
  p_credits_cents INTEGER,
  p_stripe_session_id TEXT,
  p_stripe_payment_intent TEXT,
  p_description TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance INTEGER;
  v_current_total_purchased INTEGER;
  v_new_balance INTEGER;
  v_new_total_purchased INTEGER;
  v_transaction_id UUID;
  v_already_processed BOOLEAN;
BEGIN
  -- Check if this payment was already processed (idempotency)
  SELECT EXISTS(
    SELECT 1 FROM credit_transactions
    WHERE stripe_session_id = p_stripe_session_id
  ) INTO v_already_processed;

  IF v_already_processed THEN
    RAISE NOTICE 'Payment already processed: %', p_stripe_session_id;
    RETURN jsonb_build_object(
      'success', true,
      'already_processed', true,
      'message', 'Payment already processed - duplicate webhook ignored'
    );
  END IF;

  -- Lock the user's credit row to prevent race conditions
  -- This ensures only one webhook can modify credits at a time
  SELECT balance_cents, total_purchased_cents
  INTO v_current_balance, v_current_total_purchased
  FROM user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Create user_credits row if it doesn't exist
  IF v_current_balance IS NULL THEN
    INSERT INTO user_credits (user_id, balance_cents, total_purchased_cents, total_spent_cents)
    VALUES (p_user_id, 0, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;

    -- Re-select with lock
    SELECT balance_cents, total_purchased_cents
    INTO v_current_balance, v_current_total_purchased
    FROM user_credits
    WHERE user_id = p_user_id
    FOR UPDATE;
  END IF;

  -- Calculate new balances
  v_new_balance := COALESCE(v_current_balance, 0) + p_credits_cents;
  v_new_total_purchased := COALESCE(v_current_total_purchased, 0) + p_credits_cents;

  -- Update user credits atomically
  UPDATE user_credits SET
    balance_cents = v_new_balance,
    total_purchased_cents = v_new_total_purchased,
    last_topped_up = NOW(),
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Log transaction with stripe_session_id for idempotency
  -- The UNIQUE constraint on stripe_session_id prevents duplicates
  INSERT INTO credit_transactions (
    user_id,
    type,
    amount_cents,
    balance_after_cents,
    description,
    stripe_session_id,
    metadata
  ) VALUES (
    p_user_id,
    'purchase',
    p_credits_cents,
    v_new_balance,
    p_description,
    p_stripe_session_id,
    jsonb_build_object(
      'stripe_session_id', p_stripe_session_id,
      'stripe_payment_intent', p_stripe_payment_intent
    )
  ) RETURNING id INTO v_transaction_id;

  -- Return detailed result for logging
  RETURN jsonb_build_object(
    'success', true,
    'already_processed', false,
    'transaction_id', v_transaction_id,
    'old_balance', COALESCE(v_current_balance, 0),
    'new_balance', v_new_balance,
    'credits_added', p_credits_cents,
    'user_id', p_user_id
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Another webhook beat us to it - this is expected with retries
    RAISE NOTICE 'Duplicate session_id detected: %', p_stripe_session_id;
    RETURN jsonb_build_object(
      'success', true,
      'already_processed', true,
      'message', 'Duplicate webhook detected and ignored (race condition handled)'
    );
  WHEN OTHERS THEN
    -- Log error for debugging but don't expose internals
    RAISE WARNING 'Credit purchase failed for user %: % (SQLSTATE: %)', p_user_id, SQLERRM, SQLSTATE;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Internal error processing payment',
      'sqlstate', SQLSTATE
    );
END;
$$;

-- Add comment explaining the function
COMMENT ON FUNCTION process_credit_purchase IS
'Atomically processes a credit purchase with full idempotency protection.
Prevents duplicate processing, race conditions, and partial failures.
Returns JSON with success status and details for logging.';

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION process_credit_purchase TO service_role;
