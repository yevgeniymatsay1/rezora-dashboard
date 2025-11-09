-- Add phone_numbers array to contacts table to support multiple phone numbers
ALTER TABLE contacts 
ADD COLUMN phone_numbers TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Migrate existing phone_number data to phone_numbers array
UPDATE contacts 
SET phone_numbers = CASE 
  WHEN phone_number IS NOT NULL AND phone_number != '' 
  THEN ARRAY[phone_number]
  ELSE ARRAY[]::TEXT[]
END
WHERE phone_numbers IS NULL OR phone_numbers = ARRAY[]::TEXT[];

-- Add phone_index to campaign_contact_attempts to track which number we're calling
ALTER TABLE campaign_contact_attempts
ADD COLUMN phone_index INTEGER DEFAULT 0,
ADD COLUMN total_phones INTEGER DEFAULT 1;

-- Add ordering index to ensure consistent processing
CREATE INDEX IF NOT EXISTS idx_contacts_created_order ON contacts(contact_group_id, created_at, id);

-- Add index for campaign_contact_attempts to optimize queries
CREATE INDEX IF NOT EXISTS idx_campaign_attempts_status ON campaign_contact_attempts(campaign_id, call_status, created_at);

-- Add function to get next contacts to call with proper ordering
CREATE OR REPLACE FUNCTION get_next_contacts_to_call(
  p_campaign_id UUID,
  p_max_retry_days INTEGER,
  p_limit INTEGER
) RETURNS TABLE (
  contact_id UUID,
  phone_number TEXT,
  phone_index INTEGER,
  total_phones INTEGER,
  contact_data JSONB
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH contact_phones AS (
    -- Expand contacts to have one row per phone number
    SELECT 
      c.id as contact_id,
      c.data,
      c.contact_group_id,
      c.created_at,
      phone_num,
      array_position(c.phone_numbers, phone_num) - 1 as phone_index,
      array_length(c.phone_numbers, 1) as total_phones
    FROM contacts c
    CROSS JOIN unnest(c.phone_numbers) AS phone_num
    WHERE c.status = 'active'
      AND EXISTS (
        SELECT 1 FROM campaign_contacts cc
        WHERE cc.contact_group_id = c.contact_group_id
          AND cc.campaign_id = p_campaign_id
      )
  ),
  call_history AS (
    -- Get the latest call attempt for each contact/phone combination
    SELECT DISTINCT ON (contact_id, phone_index)
      contact_id,
      phone_index,
      call_status as last_status,
      created_at as last_attempt,
      date_trunc('day', created_at) as last_attempt_day
    FROM campaign_contact_attempts
    WHERE campaign_id = p_campaign_id
    ORDER BY contact_id, phone_index, created_at DESC
  ),
  eligible_contacts AS (
    SELECT 
      cp.*,
      ch.last_status,
      ch.last_attempt,
      ch.last_attempt_day,
      CASE
        -- Never called before
        WHEN ch.contact_id IS NULL THEN 0
        -- Calculate days since first attempt for this contact
        ELSE (
          SELECT extract(day FROM now() - MIN(created_at))::int
          FROM campaign_contact_attempts
          WHERE campaign_id = p_campaign_id AND contact_id = cp.contact_id
        )
      END as days_since_first_attempt
    FROM contact_phones cp
    LEFT JOIN call_history ch 
      ON ch.contact_id = cp.contact_id 
      AND ch.phone_index = cp.phone_index
    WHERE 
      -- Include if never called
      ch.contact_id IS NULL
      -- Or if last status was no-answer and within retry window
      OR (
        ch.last_status = 'no-answer' 
        AND ch.last_attempt_day != date_trunc('day', now())  -- Not already tried today
        AND (
          SELECT extract(day FROM now() - MIN(created_at))::int
          FROM campaign_contact_attempts
          WHERE campaign_id = p_campaign_id AND contact_id = cp.contact_id
        ) < p_max_retry_days  -- Within retry days
      )
  )
  SELECT 
    ec.contact_id,
    ec.phone_num as phone_number,
    ec.phone_index,
    ec.total_phones,
    ec.data as contact_data
  FROM eligible_contacts ec
  ORDER BY 
    ec.created_at ASC,  -- Process oldest contacts first
    ec.contact_id ASC,  -- Then by contact ID
    ec.phone_index ASC  -- Then by phone number order
  LIMIT p_limit;
END;
$$;