-- Fix foreign key constraint on campaign_contact_attempts.contact_id
-- Change from NO ACTION to SET NULL to preserve call history when contacts are deleted

-- First, we need to find and drop the existing constraint
DO $$
DECLARE
    constraint_name text;
BEGIN
    -- Get the constraint name
    SELECT tc.constraint_name INTO constraint_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'campaign_contact_attempts'
        AND kcu.column_name = 'contact_id';

    -- Drop the existing constraint
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE campaign_contact_attempts DROP CONSTRAINT %I', constraint_name);
        RAISE NOTICE 'Dropped constraint: %', constraint_name;
    END IF;
END $$;

-- Recreate the constraint with ON DELETE SET NULL
ALTER TABLE campaign_contact_attempts
ADD CONSTRAINT campaign_contact_attempts_contact_id_fkey
FOREIGN KEY (contact_id)
REFERENCES contacts(id)
ON DELETE SET NULL
ON UPDATE NO ACTION;

-- Add helpful comment
COMMENT ON CONSTRAINT campaign_contact_attempts_contact_id_fkey ON campaign_contact_attempts IS
'Foreign key to contacts table. SET NULL on delete preserves call history even when contact is removed.';
