-- Add analysis columns to campaign_contact_attempts table
ALTER TABLE public.campaign_contact_attempts 
ADD COLUMN call_summary JSONB DEFAULT NULL,
ADD COLUMN appointment_data JSONB DEFAULT NULL,
ADD COLUMN custom_analysis JSONB DEFAULT NULL,
ADD COLUMN follow_up_potential TEXT DEFAULT NULL,
ADD COLUMN follow_up_reason TEXT DEFAULT NULL;

-- Add index for efficient filtering on follow_up_potential
CREATE INDEX IF NOT EXISTS idx_campaign_contact_attempts_follow_up 
ON public.campaign_contact_attempts(follow_up_potential) 
WHERE follow_up_potential IS NOT NULL;

-- Add index for appointment data filtering
CREATE INDEX IF NOT EXISTS idx_campaign_contact_attempts_appointment 
ON public.campaign_contact_attempts USING GIN(appointment_data) 
WHERE appointment_data IS NOT NULL;