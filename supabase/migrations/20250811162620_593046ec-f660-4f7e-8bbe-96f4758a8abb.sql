-- Add updated_at column to phone_numbers table and fix the retell_phone_id
-- First add the missing updated_at column
ALTER TABLE public.phone_numbers 
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS update_phone_numbers_updated_at ON public.phone_numbers;
CREATE TRIGGER update_phone_numbers_updated_at
  BEFORE UPDATE ON public.phone_numbers
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Now update the user's phone number record with the correct retell_phone_id
UPDATE public.phone_numbers 
SET retell_phone_id = '+13474482994'
WHERE user_id = '82fd459d-9a93-4fdd-8655-2128163287ba'::uuid 
  AND phone_number = '+13474482994'
  AND retell_phone_id IS NULL;