
-- Add plan field to profiles table
DO $$ 
BEGIN
  -- Create enum for user plans if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_plan') THEN
    CREATE TYPE user_plan AS ENUM ('basic', 'professional', 'summit');
  END IF;
END $$;

-- Add plan column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS plan user_plan DEFAULT 'basic';

-- Update existing users to basic plan
UPDATE public.profiles 
SET plan = 'basic' 
WHERE plan IS NULL;
