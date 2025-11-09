-- Enable pg_cron extension for campaign scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create cron job to process campaigns every minute
SELECT cron.schedule(
  'process-campaigns',
  '* * * * *', -- every minute
  $$
  SELECT
    net.http_post(
        url:='https://kssuxhxqhbwicyguzoik.supabase.co/functions/v1/process-campaign',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtzc3V4aHhxaGJ3aWN5Z3V6b2lrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwMzA1NTIsImV4cCI6MjA2ODYwNjU1Mn0.gnjnVhMslf1dILZNmXlH0RrMjnlfSBmFENfPcDcptcs"}'::jsonb,
        body:='{"triggered_by": "cron"}'::jsonb
    ) as request_id;
  $$
);