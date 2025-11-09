-- Initialize user credits for existing users who don't have records yet
INSERT INTO public.user_credits (user_id, balance_cents, total_purchased_cents, total_spent_cents)
SELECT 
    id as user_id,
    0 as balance_cents,
    0 as total_purchased_cents,
    0 as total_spent_cents
FROM auth.users 
WHERE id NOT IN (SELECT user_id FROM public.user_credits)
ON CONFLICT (user_id) DO NOTHING;