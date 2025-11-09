-- Add ended_at column to campaign_contact_attempts table
ALTER TABLE public.campaign_contact_attempts 
ADD COLUMN ended_at TIMESTAMP WITH TIME ZONE;