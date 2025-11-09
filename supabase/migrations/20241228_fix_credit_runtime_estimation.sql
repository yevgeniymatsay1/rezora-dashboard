-- Fix estimated runtime calculation to use correct hourly rate
-- Previous calculation was using $6/hour instead of $12/hour
-- Real cost is $0.20 per minute of conversation = $12 per hour

-- Drop and recreate the function with correct calculation
CREATE OR REPLACE FUNCTION public.get_credit_status(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_balance INTEGER;
  v_reserved INTEGER;
  v_available INTEGER;
  v_recent_usage INTEGER;
  v_estimated_runtime_hours NUMERIC;
  v_hourly_rate NUMERIC;
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
  
  -- Calculate estimated runtime based on usage patterns
  -- Default rate: $0.20 per minute = $12 per hour = 1200 cents per hour
  IF v_recent_usage > 0 THEN
    -- Calculate actual hourly burn rate from recent usage
    -- v_recent_usage is total spent in last 7 days (168 hours)
    v_hourly_rate := v_recent_usage::NUMERIC / 168;
    
    -- Only use the actual rate if it's reasonable (between $1 and $50 per hour)
    -- This prevents skewed estimates from very low or very high usage periods
    IF v_hourly_rate < 100 THEN
      v_hourly_rate := 1200; -- Use default if rate seems too low
    ELSIF v_hourly_rate > 5000 THEN
      v_hourly_rate := 1200; -- Use default if rate seems too high
    END IF;
    
    v_estimated_runtime_hours := v_available::NUMERIC / v_hourly_rate;
  ELSE
    -- No recent usage, use default rate
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

-- Add comment explaining the calculation
COMMENT ON FUNCTION public.get_credit_status(UUID) IS 
'Returns credit status for a user including balance, recent usage, and estimated runtime.
Estimated runtime is calculated based on recent usage patterns if available, 
otherwise uses default rate of $0.20/minute ($12/hour) for voice conversation time.';