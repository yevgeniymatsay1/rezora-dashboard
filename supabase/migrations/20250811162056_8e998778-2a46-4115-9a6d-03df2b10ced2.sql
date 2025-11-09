-- Add existing phone number for testing
-- This adds the phone number +13474482994 which already exists in RetellAI backend
-- Replace 'YOUR_USER_ID_HERE' with your actual user ID when running this migration

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
  'YOUR_USER_ID_HERE'::uuid,  -- Replace with your actual user ID
  '+13474482994',
  '347',
  'active'::phone_status,
  500,
  true,
  now() + interval '1 month',
  now()
) ON CONFLICT (phone_number, user_id) DO NOTHING;