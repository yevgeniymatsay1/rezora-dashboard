-- Missing RPC functions that frontend expects
-- These functions are called by various components but were never created

-- 1. get_credit_status: Used by CreditStatusIndicator component
CREATE OR REPLACE FUNCTION public.get_credit_status(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_balance INTEGER;
  v_reserved INTEGER;
  v_available INTEGER;
  v_recent_usage INTEGER;
  v_estimated_runtime_hours NUMERIC;
BEGIN
  -- Get balance and reserved amounts
  SELECT 
    COALESCE(balance_cents, 0),
    COALESCE(reserved_cents, 0)
  INTO v_balance, v_reserved
  FROM public.user_credits
  WHERE user_id = p_user_id;

  -- If no record exists, create one
  IF v_balance IS NULL THEN
    INSERT INTO public.user_credits (user_id, balance_cents, reserved_cents)
    VALUES (p_user_id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;
    v_balance := 0;
    v_reserved := 0;
  END IF;
  
  v_available := v_balance - v_reserved;
  
  -- Calculate recent usage (last 7 days)
  SELECT COALESCE(SUM(ABS(amount_cents)), 0)
  INTO v_recent_usage
  FROM public.credit_transactions
  WHERE user_id = p_user_id
    AND type = 'usage'
    AND created_at >= NOW() - INTERVAL '7 days';
  
  -- Estimate runtime based on recent usage or default cost
  -- Default: $0.20 per minute = $12 per hour = 1200 cents per hour of conversation
  IF v_recent_usage > 0 THEN
    -- Calculate hourly burn rate from last 7 days
    -- v_recent_usage is total spent in last 7 days (168 hours)
    v_estimated_runtime_hours := (v_available::NUMERIC / (v_recent_usage::NUMERIC / 168));
  ELSE
    -- No recent usage, estimate based on $0.20 per minute average
    -- $0.20/min * 60 min = $12/hour = 1200 cents per hour
    v_estimated_runtime_hours := v_available::NUMERIC / 1200;
  END IF;
  
  RETURN jsonb_build_object(
    'balance_cents', v_balance,
    'balance_formatted', '$' || ROUND(v_balance / 100.0, 2),
    'reserved_cents', v_reserved,
    'available_cents', v_available,
    'recent_usage_cents', v_recent_usage,
    'estimated_runtime_hours', CASE 
      WHEN v_estimated_runtime_hours > 0 THEN ROUND(v_estimated_runtime_hours, 1)
      ELSE NULL
    END,
    'warning_threshold', 500,  -- $5.00
    'critical_threshold', 100, -- $1.00
    'status', CASE
      WHEN v_available <= 0 THEN 'depleted'
      WHEN v_available <= 100 THEN 'critical'
      WHEN v_available <= 500 THEN 'warning'
      ELSE 'normal'
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_credit_status(UUID) TO authenticated;

-- 2. check_agent_edit_allowed: Used by agents.service.ts
CREATE OR REPLACE FUNCTION public.check_agent_edit_allowed(agent_uuid UUID)
RETURNS JSONB AS $$
DECLARE
  v_campaign_count INTEGER;
  v_can_edit BOOLEAN;
  v_message TEXT;
BEGIN
  -- Check if agent exists and belongs to current user
  IF NOT EXISTS (
    SELECT 1 FROM public.user_agents 
    WHERE id = agent_uuid 
    AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'message', 'Agent not found or access denied'
    );
  END IF;

  -- Check for active/paused/scheduled campaigns using this agent
  SELECT COUNT(*)
  INTO v_campaign_count
  FROM public.campaigns
  WHERE agent_id = agent_uuid
    AND status IN ('active', 'paused', 'scheduled')
    AND deleted_at IS NULL;
  
  v_can_edit := v_campaign_count = 0;
  
  IF v_can_edit THEN
    v_message := 'Agent can be edited';
  ELSE
    v_message := FORMAT('Cannot edit: %s active/paused campaign(s) are using this agent', v_campaign_count);
  END IF;
  
  RETURN jsonb_build_object(
    'allowed', v_can_edit,
    'message', v_message,
    'active_campaigns', v_campaign_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.check_agent_edit_allowed(UUID) TO authenticated;

-- 3. release_reserved_credits: Used by billing.service.ts
CREATE OR REPLACE FUNCTION public.release_reserved_credits(
  p_user_id UUID,
  p_amount_cents INTEGER
)
RETURNS JSONB AS $$
DECLARE
  v_current_reserved INTEGER;
  v_new_reserved INTEGER;
BEGIN
  -- Get current reserved amount with lock
  SELECT reserved_cents
  INTO v_current_reserved
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;
  
  IF v_current_reserved IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No credits record found'
    );
  END IF;
  
  -- Calculate new reserved amount (don't go below 0)
  v_new_reserved := GREATEST(0, v_current_reserved - p_amount_cents);
  
  -- Update reserved credits
  UPDATE public.user_credits
  SET 
    reserved_cents = v_new_reserved,
    updated_at = NOW()
  WHERE user_id = p_user_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'released_amount', p_amount_cents,
    'previous_reserved', v_current_reserved,
    'new_reserved', v_new_reserved
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.release_reserved_credits(UUID, INTEGER) TO authenticated;

-- 4. deduct_credits: Simple credit deduction (used in multiple places)
CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_user_id UUID,
  p_amount_cents INTEGER,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
  v_transaction_id UUID;
BEGIN
  -- Lock the user credits row for update
  SELECT balance_cents
  INTO v_current_balance
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;
  
  -- Create record if doesn't exist
  IF v_current_balance IS NULL THEN
    INSERT INTO public.user_credits (user_id, balance_cents)
    VALUES (p_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
    v_current_balance := 0;
  END IF;
  
  -- Check if sufficient balance
  IF v_current_balance < p_amount_cents THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient credits',
      'current_balance', v_current_balance,
      'required_amount', p_amount_cents
    );
  END IF;
  
  -- Calculate new balance
  v_new_balance := v_current_balance - p_amount_cents;
  
  -- Update user credits
  UPDATE public.user_credits
  SET 
    balance_cents = v_new_balance,
    total_spent_cents = total_spent_cents + p_amount_cents,
    updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Insert transaction record
  INSERT INTO public.credit_transactions (
    user_id, 
    type, 
    amount_cents, 
    balance_after_cents,
    description, 
    metadata
  ) VALUES (
    p_user_id, 
    'usage', 
    -p_amount_cents, 
    v_new_balance,
    COALESCE(p_description, 'Credit usage'),
    p_metadata
  ) RETURNING id INTO v_transaction_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'previous_balance', v_current_balance,
    'new_balance', v_new_balance,
    'amount_deducted', p_amount_cents,
    'transaction_id', v_transaction_id
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.deduct_credits(UUID, INTEGER, TEXT, JSONB) TO authenticated;

-- Add helper function to get user's available credits (balance - reserved)
CREATE OR REPLACE FUNCTION public.get_available_credits(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_balance INTEGER;
  v_reserved INTEGER;
BEGIN
  SELECT 
    COALESCE(balance_cents, 0),
    COALESCE(reserved_cents, 0)
  INTO v_balance, v_reserved
  FROM public.user_credits
  WHERE user_id = p_user_id;
  
  IF v_balance IS NULL THEN
    RETURN 0;
  END IF;
  
  RETURN GREATEST(0, v_balance - v_reserved);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_available_credits(UUID) TO authenticated;

-- Add missing columns if they don't exist
DO $$
BEGIN
  -- Add reserved_cents column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_credits' 
    AND column_name = 'reserved_cents'
  ) THEN
    ALTER TABLE public.user_credits 
    ADD COLUMN reserved_cents INTEGER DEFAULT 0;
  END IF;
  
  -- Add total_spent_cents column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_credits' 
    AND column_name = 'total_spent_cents'
  ) THEN
    ALTER TABLE public.user_credits 
    ADD COLUMN total_spent_cents INTEGER DEFAULT 0;
  END IF;
END $$;