-- Create atomic credit deduction function to prevent race conditions
CREATE OR REPLACE FUNCTION public.atomic_deduct_call_cost(
  p_user_id UUID,
  p_cost_cents INTEGER,
  p_attempt_id UUID,
  p_call_metadata JSONB
) RETURNS JSONB AS $$
DECLARE
  current_balance INTEGER;
  new_balance INTEGER;
  transaction_id UUID;
BEGIN
  -- Lock the user credits row for update (prevents concurrent modifications)
  SELECT balance_cents INTO current_balance
  FROM public.user_credits 
  WHERE user_id = p_user_id 
  FOR UPDATE;
  
  -- If no credits record exists, create one
  IF current_balance IS NULL THEN
    INSERT INTO public.user_credits (user_id, balance_cents)
    VALUES (p_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
    current_balance := 0;
  END IF;
  
  -- Calculate new balance (allow negative balance)
  new_balance := current_balance - p_cost_cents;
  
  -- Update user credits atomically
  UPDATE public.user_credits SET
    balance_cents = new_balance,
    total_spent_cents = total_spent_cents + p_cost_cents,
    updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Insert transaction record
  INSERT INTO public.credit_transactions (
    user_id, type, amount_cents, balance_after_cents, 
    description, metadata
  ) VALUES (
    p_user_id, 'usage', -p_cost_cents, new_balance,
    p_call_metadata->>'description', p_call_metadata
  ) RETURNING id INTO transaction_id;
  
  -- Insert call cost record
  INSERT INTO public.call_costs (
    campaign_contact_attempt_id, 
    retell_cost_cents, 
    user_cost_cents,
    call_duration_seconds, 
    cost_breakdown
  ) VALUES (
    p_attempt_id,
    (p_call_metadata->>'retell_cost_cents')::INTEGER,
    p_cost_cents,
    (p_call_metadata->>'duration_seconds')::INTEGER,
    p_call_metadata->'cost_breakdown'
  );
  
  -- Return success with new balance
  RETURN jsonb_build_object(
    'success', true,
    'previous_balance', current_balance,
    'new_balance', new_balance,
    'transaction_id', transaction_id,
    'cost_deducted', p_cost_cents
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Automatic rollback on any error
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'error_detail', SQLSTATE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to safely check and reserve credits for concurrent calls
CREATE OR REPLACE FUNCTION public.check_and_reserve_credits(
  p_user_id UUID,
  p_estimated_cost_cents INTEGER DEFAULT 100
) RETURNS JSONB AS $$
DECLARE
  current_balance INTEGER;
  reserved_amount INTEGER;
BEGIN
  -- Lock and get current balance
  SELECT balance_cents INTO current_balance
  FROM public.user_credits 
  WHERE user_id = p_user_id 
  FOR UPDATE;
  
  -- If no credits record, create one
  IF current_balance IS NULL THEN
    INSERT INTO public.user_credits (user_id, balance_cents)
    VALUES (p_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
    current_balance := 0;
  END IF;
  
  -- For now, we allow calls even with zero balance (credits can go negative)
  -- This prevents blocking legitimate calls due to minor timing issues
  
  RETURN jsonb_build_object(
    'success', true,
    'current_balance', current_balance,
    'can_proceed', true,
    'message', CASE 
      WHEN current_balance <= 0 THEN 'Low balance but allowing call'
      ELSE 'Sufficient balance'
    END
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'can_proceed', false
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;