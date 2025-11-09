
-- 1) Web call sessions table
CREATE TABLE IF NOT EXISTS public.web_call_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  agent_id uuid NOT NULL REFERENCES public.user_agents(id) ON DELETE CASCADE,
  retell_call_id text,
  status text DEFAULT 'initiated',
  duration_seconds integer,
  started_at timestamptz,
  ended_at timestamptz,
  recording_url text,
  transcript text,
  call_summary jsonb,
  call_successful boolean,
  custom_analysis jsonb,
  appointment_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Keep timestamps up to date
DROP TRIGGER IF EXISTS set_updated_at_web_call_sessions ON public.web_call_sessions;
CREATE TRIGGER set_updated_at_web_call_sessions
BEFORE UPDATE ON public.web_call_sessions
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Enable RLS
ALTER TABLE public.web_call_sessions ENABLE ROW LEVEL SECURITY;

-- Only service role can manage
DROP POLICY IF EXISTS "Service role can manage web call sessions" ON public.web_call_sessions;
CREATE POLICY "Service role can manage web call sessions"
ON public.web_call_sessions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Users can view their own sessions
DROP POLICY IF EXISTS "Users can view own web call sessions" ON public.web_call_sessions;
CREATE POLICY "Users can view own web call sessions"
ON public.web_call_sessions
FOR SELECT
USING (auth.uid() = user_id);

--------------------------------------------------------------------------------

-- 2) Web call costs table (mirrors call_costs for campaign calls)
CREATE TABLE IF NOT EXISTS public.web_call_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  web_call_session_id uuid NOT NULL REFERENCES public.web_call_sessions(id) ON DELETE CASCADE,
  retell_cost_cents integer NOT NULL,
  user_cost_cents integer NOT NULL,
  call_duration_seconds integer,
  cost_breakdown jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.web_call_costs ENABLE ROW LEVEL SECURITY;

-- Only service role can manage
DROP POLICY IF EXISTS "Service role can manage web call costs" ON public.web_call_costs;
CREATE POLICY "Service role can manage web call costs"
ON public.web_call_costs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Users can view their own web call costs
DROP POLICY IF EXISTS "Users can view own web call costs" ON public.web_call_costs;
CREATE POLICY "Users can view own web call costs"
ON public.web_call_costs
FOR SELECT
USING (
  web_call_session_id IN (
    SELECT wcs.id
    FROM public.web_call_sessions wcs
    WHERE wcs.user_id = auth.uid()
  )
);

--------------------------------------------------------------------------------

-- 3) Atomic cost deduction function for web calls
CREATE OR REPLACE FUNCTION public.atomic_deduct_web_call_cost(
  p_user_id uuid,
  p_cost_cents integer,
  p_web_call_id uuid,
  p_call_metadata jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  current_balance INTEGER;
  new_balance INTEGER;
  transaction_id UUID;
BEGIN
  -- Lock user credits row for update
  SELECT balance_cents INTO current_balance
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Create credits row if missing
  IF current_balance IS NULL THEN
    INSERT INTO public.user_credits (user_id, balance_cents)
    VALUES (p_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
    current_balance := 0;
  END IF;

  -- Allow negative balances for now (same behavior as campaign calls)
  new_balance := current_balance - p_cost_cents;

  -- Update user credits
  UPDATE public.user_credits SET
    balance_cents = new_balance,
    total_spent_cents = total_spent_cents + p_cost_cents,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Insert credit transaction (usage)
  INSERT INTO public.credit_transactions (
    user_id, type, amount_cents, balance_after_cents, description, metadata
  ) VALUES (
    p_user_id, 'usage', -p_cost_cents, new_balance,
    p_call_metadata->>'description', p_call_metadata
  ) RETURNING id INTO transaction_id;

  -- Insert web call cost record
  INSERT INTO public.web_call_costs (
    web_call_session_id,
    retell_cost_cents,
    user_cost_cents,
    call_duration_seconds,
    cost_breakdown
  ) VALUES (
    p_web_call_id,
    (p_call_metadata->>'retell_cost_cents')::INTEGER,
    p_cost_cents,
    (p_call_metadata->>'duration_seconds')::INTEGER,
    p_call_metadata->'cost_breakdown'
  );

  RETURN jsonb_build_object(
    'success', true,
    'previous_balance', current_balance,
    'new_balance', new_balance,
    'transaction_id', transaction_id,
    'cost_deducted', p_cost_cents
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'error_detail', SQLSTATE
  );
END;
$function$;
