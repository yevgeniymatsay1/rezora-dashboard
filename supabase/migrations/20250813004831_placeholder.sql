-- Tighten RLS policies to restrict sensitive mutations to service_role and protect profile admin fields

-- 1) Call Costs: restrict management to service role
DROP POLICY IF EXISTS "System can manage call costs" ON public.call_costs;
CREATE POLICY "Service role can manage call costs"
ON public.call_costs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- keep existing user SELECT policy as-is

-- 2) Campaign Contact Attempts: restrict insert/update to service role
DROP POLICY IF EXISTS "System can insert campaign attempts" ON public.campaign_contact_attempts;
DROP POLICY IF EXISTS "System can update campaign attempts" ON public.campaign_contact_attempts;
CREATE POLICY "Service role can insert campaign attempts"
ON public.campaign_contact_attempts
FOR INSERT
TO service_role
WITH CHECK (true);
CREATE POLICY "Service role can update campaign attempts"
ON public.campaign_contact_attempts
FOR UPDATE
TO service_role
USING (true);

-- 3) Phone Subscription Transactions: restrict management to service role
DROP POLICY IF EXISTS "System can manage phone subscription transactions" ON public.phone_subscription_transactions;
CREATE POLICY "Service role can manage phone subscription transactions"
ON public.phone_subscription_transactions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4) Credit Transactions: only service role can insert
DROP POLICY IF EXISTS "System can insert transactions" ON public.credit_transactions;
CREATE POLICY "Service role can insert transactions"
ON public.credit_transactions
FOR INSERT
TO service_role
WITH CHECK (true);

-- keep existing user SELECT policy as-is

-- 5) Credit Packages: restrict management to service role (admin operations)
DROP POLICY IF EXISTS "System can manage packages" ON public.credit_packages;
CREATE POLICY "Service role can manage credit packages"
ON public.credit_packages
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- keep existing public SELECT active packages policy as-is

-- 6) User Credits: remove direct user updates, allow service role management only
DROP POLICY IF EXISTS "Users can update own credits" ON public.user_credits;
CREATE POLICY "Service role can manage user credits"
ON public.user_credits
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 7) Protect privileged profile fields (plan, role) from user updates
CREATE OR REPLACE FUNCTION public.prevent_privileged_profile_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  jwt jsonb;
  jwt_role text;
BEGIN
  jwt := current_setting('request.jwt.claims', true)::jsonb;
  jwt_role := COALESCE(jwt->>'role', '');

  -- If not service role, prevent changes to admin-controlled fields
  IF jwt_role <> 'service_role' THEN
    IF NEW.plan IS DISTINCT FROM OLD.plan OR NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Updating admin-controlled profile fields is not allowed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_admin_fields ON public.profiles;
CREATE TRIGGER protect_profile_admin_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_privileged_profile_changes();
