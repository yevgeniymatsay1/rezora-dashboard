-- Update get_next_contacts_to_call function to return actual contact data
CREATE OR REPLACE FUNCTION public.get_next_contacts_to_call(p_campaign_id uuid, p_max_retry_days integer, p_limit integer)
 RETURNS TABLE(contact_id uuid, phone_number text, phone_index integer, total_phones integer, contact_data jsonb)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  WITH contact_phones AS (
    -- Expand contacts to have one row per phone number
    SELECT 
      c.id as contact_id,
      -- Build proper contact_data with all relevant fields
      jsonb_build_object(
        'first_name', c.first_name,
        'last_name', c.last_name,
        'email', c.email,
        'address', c.address,
        'phone_number', regexp_replace(phone_num, '[^0-9]', '', 'g'),
        'custom_fields', c.custom_fields
      ) as data,
      c.contact_group_id,
      c.created_at as contact_created_at,
      phone_num,
      array_position(c.phone_numbers, phone_num) - 1 as phone_index,
      array_length(c.phone_numbers, 1) as total_phones
    FROM public.contacts c
    CROSS JOIN unnest(c.phone_numbers) AS phone_num
    WHERE c.status = 'active'
      AND EXISTS (
        SELECT 1 FROM public.campaign_contacts cc
        WHERE cc.contact_group_id = c.contact_group_id
          AND cc.campaign_id = p_campaign_id
      )
  ),
  call_history AS (
    -- Get the latest call attempt for each contact/phone combination
    SELECT DISTINCT ON (cca.contact_id, cca.phone_index)
      cca.contact_id,
      cca.phone_index,
      cca.call_status as last_status,
      cca.created_at as last_attempt,
      date_trunc('day', cca.created_at) as last_attempt_day
    FROM public.campaign_contact_attempts cca
    WHERE cca.campaign_id = p_campaign_id
    ORDER BY cca.contact_id, cca.phone_index, cca.created_at DESC
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
          SELECT extract(day FROM now() - MIN(cca.created_at))::int
          FROM public.campaign_contact_attempts cca
          WHERE cca.campaign_id = p_campaign_id AND cca.contact_id = cp.contact_id
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
          SELECT extract(day FROM now() - MIN(cca.created_at))::int
          FROM public.campaign_contact_attempts cca
          WHERE cca.campaign_id = p_campaign_id AND cca.contact_id = cp.contact_id
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
    ec.contact_created_at ASC,  -- Process oldest contacts first
    ec.contact_id ASC,  -- Then by contact ID
    ec.phone_index ASC  -- Then by phone number order
  LIMIT p_limit;
END;
$function$