-- Add updated_at column to phone_numbers table if it doesn't exist
ALTER TABLE public.phone_numbers 
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS update_phone_numbers_updated_at ON public.phone_numbers;
CREATE TRIGGER update_phone_numbers_updated_at
  BEFORE UPDATE ON public.phone_numbers
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- First, update any user_agents that reference the duplicate phone number 
-- to reference the correct user's phone number instead
UPDATE public.user_agents 
SET phone_number_id = (
  SELECT id FROM public.phone_numbers 
  WHERE user_id = '82fd459d-9a93-4fdd-8655-2128163287ba'::uuid 
    AND phone_number = '+13474482994'
)
WHERE phone_number_id = (
  SELECT id FROM public.phone_numbers 
  WHERE phone_number = '+13474482994' 
    AND user_id != '82fd459d-9a93-4fdd-8655-2128163287ba'::uuid
);

-- Now we can safely delete the duplicate phone number record
DELETE FROM public.phone_numbers 
WHERE phone_number = '+13474482994' 
  AND user_id != '82fd459d-9a93-4fdd-8655-2128163287ba'::uuid;

-- Finally, update the user's phone number record with the correct retell_phone_id
UPDATE public.phone_numbers 
SET retell_phone_id = '+13474482994'
WHERE user_id = '82fd459d-9a93-4fdd-8655-2128163287ba'::uuid 
  AND phone_number = '+13474482994';