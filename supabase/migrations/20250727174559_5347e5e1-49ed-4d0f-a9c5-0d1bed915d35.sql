-- Add missing recording_url and transcript columns to campaign_contact_attempts table
ALTER TABLE public.campaign_contact_attempts 
ADD COLUMN recording_url TEXT,
ADD COLUMN transcript TEXT;