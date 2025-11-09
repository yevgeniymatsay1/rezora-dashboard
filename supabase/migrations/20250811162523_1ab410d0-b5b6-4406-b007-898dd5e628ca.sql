-- Fix phone number sync by updating retell_phone_id
-- Update the user's phone number record with the correct retell_phone_id
UPDATE public.phone_numbers 
SET retell_phone_id = '+13474482994'
WHERE user_id = '82fd459d-9a93-4fdd-8655-2128163287ba'::uuid 
  AND phone_number = '+13474482994'
  AND retell_phone_id IS NULL;