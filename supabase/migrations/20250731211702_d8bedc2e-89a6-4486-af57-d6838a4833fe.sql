-- Add call_successful column to campaign_contact_attempts table
ALTER TABLE public.campaign_contact_attempts 
ADD COLUMN call_successful boolean;