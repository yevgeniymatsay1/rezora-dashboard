-- Add timezone support to profiles table
ALTER TABLE public.profiles 
ADD COLUMN timezone text DEFAULT 'America/New_York';

-- Add campaign control columns
ALTER TABLE public.campaigns 
ADD COLUMN timezone text DEFAULT 'America/New_York',
ADD COLUMN active_calls_count integer DEFAULT 0;

-- Update user_agents table to store dynamic prompt
ALTER TABLE public.user_agents 
ADD COLUMN dynamic_prompt text;