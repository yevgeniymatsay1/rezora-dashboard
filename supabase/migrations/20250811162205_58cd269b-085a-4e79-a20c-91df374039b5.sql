-- Add existing phone number for testing
-- This adds the phone number +13474482994 which already exists in RetellAI backend

INSERT INTO public.phone_numbers (
  user_id,
  phone_number,
  area_code,
  status,
  monthly_cost_cents,
  subscription_active,
  next_billing_date,
  purchased_at
) VALUES (
  '82fd459d-9a93-4fdd-8655-2128163287ba'::uuid,
  '+13474482994',
  '347',
  'active'::phone_status,
  500,
  true,
  now() + interval '1 month',
  now()
);