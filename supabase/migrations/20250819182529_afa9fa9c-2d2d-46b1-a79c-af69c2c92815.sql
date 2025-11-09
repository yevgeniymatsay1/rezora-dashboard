-- Fix existing phone number record that has null retell_phone_id
-- Set retell_phone_id to same value as phone_number for the user's current phone number
UPDATE public.phone_numbers 
SET retell_phone_id = phone_number, 
    updated_at = NOW()
WHERE retell_phone_id IS NULL 
  AND phone_number = '+18578550703';