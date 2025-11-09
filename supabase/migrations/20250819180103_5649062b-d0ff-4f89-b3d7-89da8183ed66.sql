-- Allow NULL values for phone_number_id to fix webhook transaction logging
-- This allows transactions to be logged even when phone_number_id is not immediately available
ALTER TABLE public.phone_subscription_transactions 
ALTER COLUMN phone_number_id DROP NOT NULL;