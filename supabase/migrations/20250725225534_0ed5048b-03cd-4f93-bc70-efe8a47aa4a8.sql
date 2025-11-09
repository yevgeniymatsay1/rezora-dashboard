-- Enable the pg_net extension for HTTP requests in cron jobs
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Delete the existing cron job if it exists
SELECT cron.unschedule('process-campaigns');

-- Create the corrected cron job with proper HTTP request
SELECT cron.schedule(
  'process-campaigns',
  '* * * * *', -- Every minute
  $$
  SELECT
    net.http_post(
      url := 'https://kssuxhxqhbwicyguzoik.supabase.co/functions/v1/process-campaign',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtzc3V4aHhxaGJ3aWN5Z3V6b2lrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwMzA1NTIsImV4cCI6MjA2ODYwNjU1Mn0.gnjnVhMslf1dILZNmXlH0RrMjnlfSBmFENfPcDcptcs'
      ),
      body := jsonb_build_object('triggered_by', 'cron')
    ) as request_id;
  $$
);