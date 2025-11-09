-- Fix critical security vulnerability: Remove overly permissive policy on user_credits
-- This policy allowed any authenticated user to access all user financial data

-- Drop the dangerous "System can manage user credits" policy that uses "true" expression
DROP POLICY IF EXISTS "System can manage user credits" ON public.user_credits;

-- Create a more secure system policy that only allows service role operations
-- This ensures only edge functions and authorized system operations can manage credits
CREATE POLICY "Service role can manage user credits" 
ON public.user_credits 
FOR ALL 
TO service_role 
USING (true);

-- Ensure individual users can still view and update only their own credits
-- These policies should already exist but let's make sure they're properly configured
DROP POLICY IF EXISTS "Users can view own credits" ON public.user_credits;
DROP POLICY IF EXISTS "Users can update own credits" ON public.user_credits;

CREATE POLICY "Users can view own credits" 
ON public.user_credits 
FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own credits" 
ON public.user_credits 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id);