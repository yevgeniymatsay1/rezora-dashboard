-- Fix phone_numbers table schema
ALTER TABLE public.phone_numbers 
ALTER COLUMN agent_id TYPE uuid USING agent_id::uuid;

-- Ensure RLS policies are correct for phone_numbers
DROP POLICY IF EXISTS "Users can manage own phone numbers" ON public.phone_numbers;

CREATE POLICY "Users can manage own phone numbers" 
ON public.phone_numbers 
FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);