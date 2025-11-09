-- Fix CASCADE DELETE issue that was causing data loss when campaigns are deleted
-- Change from CASCADE to SET NULL to preserve historical data

-- Drop the existing foreign key constraint on campaign_contact_attempts
ALTER TABLE campaign_contact_attempts 
DROP CONSTRAINT IF EXISTS campaign_contact_attempts_campaign_id_fkey;

-- Add the new foreign key constraint with ON DELETE SET NULL
ALTER TABLE campaign_contact_attempts 
ADD CONSTRAINT campaign_contact_attempts_campaign_id_fkey 
FOREIGN KEY (campaign_id) 
REFERENCES campaigns(id) 
ON DELETE SET NULL;

-- Ensure user_id is always populated going forward (from previous fix)
-- This ensures we can still query user's data even after campaign deletion

-- Add comment to document the change
COMMENT ON COLUMN campaign_contact_attempts.campaign_id IS 
'Reference to campaign. Set to NULL when campaign is deleted to preserve historical data.';

-- Verify the constraint was applied correctly
DO $$
BEGIN
  -- Check if the constraint exists with the correct delete action
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.referential_constraints 
    WHERE constraint_name = 'campaign_contact_attempts_campaign_id_fkey'
      AND delete_rule = 'SET NULL'
  ) THEN
    RAISE EXCEPTION 'Foreign key constraint was not properly updated to SET NULL';
  END IF;
END $$;