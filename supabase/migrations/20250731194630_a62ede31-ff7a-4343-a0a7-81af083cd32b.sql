-- Add subscription fields to phone_numbers table
ALTER TABLE public.phone_numbers 
ADD COLUMN monthly_cost_cents INTEGER NOT NULL DEFAULT 500,
ADD COLUMN subscription_active BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN next_billing_date TIMESTAMPTZ DEFAULT (now() + interval '1 month'),
ADD COLUMN purchased_at TIMESTAMPTZ DEFAULT now();

-- Create phone_subscription_transactions table for monthly billing history
CREATE TABLE public.phone_subscription_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_id UUID NOT NULL REFERENCES public.phone_numbers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  amount_cents INTEGER NOT NULL,
  transaction_type TEXT NOT NULL DEFAULT 'monthly_charge',
  billing_period_start TIMESTAMPTZ NOT NULL,
  billing_period_end TIMESTAMPTZ NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending', -- pending, paid, failed
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on the new table
ALTER TABLE public.phone_subscription_transactions ENABLE ROW LEVEL SECURITY;

-- Create policies for phone subscription transactions
CREATE POLICY "Users can view own phone subscription transactions" 
ON public.phone_subscription_transactions 
FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "System can manage phone subscription transactions" 
ON public.phone_subscription_transactions 
FOR ALL 
USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_phone_subscription_transactions_updated_at
BEFORE UPDATE ON public.phone_subscription_transactions
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();