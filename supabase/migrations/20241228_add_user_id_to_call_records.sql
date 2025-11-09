-- Add user_id column to call_records table for better query performance
-- This allows direct filtering by user without going through campaigns

-- Add the column
ALTER TABLE public.call_records 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_call_records_user_id 
ON public.call_records(user_id);

-- Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_call_records_user_created 
ON public.call_records(user_id, created_at DESC);

-- Backfill user_id from campaigns table
UPDATE public.call_records cr
SET user_id = c.user_id
FROM public.campaigns c
WHERE cr.campaign_id = c.id
AND cr.user_id IS NULL;

-- Make user_id NOT NULL after backfill
ALTER TABLE public.call_records 
ALTER COLUMN user_id SET NOT NULL;

-- Add RLS policy for call_records if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'call_records' 
    AND policyname = 'Users can view own call records'
  ) THEN
    CREATE POLICY "Users can view own call records" 
    ON public.call_records 
    FOR SELECT 
    USING (auth.uid() = user_id);
  END IF;
END $$;

-- Similarly, add user_id to campaign_contact_attempts for consistency
ALTER TABLE public.campaign_contact_attempts 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Backfill user_id for campaign_contact_attempts
UPDATE public.campaign_contact_attempts cca
SET user_id = c.user_id
FROM public.campaigns c
WHERE cca.campaign_id = c.id
AND cca.user_id IS NULL;

-- Create index for campaign_contact_attempts
CREATE INDEX IF NOT EXISTS idx_campaign_contact_attempts_user_id 
ON public.campaign_contact_attempts(user_id);

-- Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_campaign_contact_attempts_user_created 
ON public.campaign_contact_attempts(user_id, created_at DESC);