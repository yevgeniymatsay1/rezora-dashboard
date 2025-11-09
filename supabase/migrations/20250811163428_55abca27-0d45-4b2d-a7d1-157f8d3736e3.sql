-- Transfer phone number +13474482994 to the correct user account
-- From user_id: 82fd459d-9a93-4fdd-8655-2128163287ba
-- To user_id: 47eccf24-d617-4221-832e-3ce758aa8f49

-- First, update any user_agents that reference this phone number to be owned by the correct user
UPDATE public.user_agents 
SET user_id = '47eccf24-d617-4221-832e-3ce758aa8f49'::uuid
WHERE phone_number_id = (
  SELECT id FROM public.phone_numbers 
  WHERE phone_number = '+13474482994' 
    AND user_id = '82fd459d-9a93-4fdd-8655-2128163287ba'::uuid
);

-- Update any campaigns that reference this phone number to be owned by the correct user
UPDATE public.campaigns 
SET user_id = '47eccf24-d617-4221-832e-3ce758aa8f49'::uuid
WHERE agent_id IN (
  SELECT id FROM public.user_agents 
  WHERE phone_number_id = (
    SELECT id FROM public.phone_numbers 
    WHERE phone_number = '+13474482994' 
      AND user_id = '82fd459d-9a93-4fdd-8655-2128163287ba'::uuid
  )
);

-- Finally, transfer the phone number itself to the correct user
UPDATE public.phone_numbers 
SET user_id = '47eccf24-d617-4221-832e-3ce758aa8f49'::uuid,
    updated_at = now()
WHERE phone_number = '+13474482994' 
  AND user_id = '82fd459d-9a93-4fdd-8655-2128163287ba'::uuid;