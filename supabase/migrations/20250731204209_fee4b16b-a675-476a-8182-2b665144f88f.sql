-- Add stripe_subscription_id to phone_numbers table to track subscriptions
ALTER TABLE public.phone_numbers 
ADD COLUMN stripe_subscription_id TEXT;

-- Create index for faster lookups
CREATE INDEX idx_phone_numbers_stripe_subscription_id 
ON public.phone_numbers (stripe_subscription_id);

-- Add updated_at trigger if not exists
CREATE TRIGGER update_phone_numbers_updated_at
  BEFORE UPDATE ON public.phone_numbers
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();