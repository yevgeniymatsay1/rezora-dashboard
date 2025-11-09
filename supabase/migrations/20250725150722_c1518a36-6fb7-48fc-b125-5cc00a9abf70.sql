-- Add new columns to campaigns table
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS concurrent_calls INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS max_retry_days INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS calling_hours JSONB DEFAULT '{"start": "09:00", "end": "17:00"}',
ADD COLUMN IF NOT EXISTS active_days TEXT[] DEFAULT ARRAY['mon', 'tue', 'wed', 'thu', 'fri'],
ADD COLUMN IF NOT EXISTS field_mappings JSONB DEFAULT '{"mappings": []}';

-- Add draft status to campaign_status enum
ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'draft';

-- Create campaign_contact_attempts table
CREATE TABLE IF NOT EXISTS campaign_contact_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id),
  phone_number TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  attempt_day INTEGER NOT NULL DEFAULT 0,
  scheduled_time TIME,
  actual_time TIME,
  call_status call_status,
  call_duration INTEGER,
  retell_call_id TEXT,
  retell_call_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(campaign_id, contact_id, phone_number, attempt_number)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaign_attempts_status ON campaign_contact_attempts(campaign_id, call_status);
CREATE INDEX IF NOT EXISTS idx_campaign_attempts_contact ON campaign_contact_attempts(campaign_id, contact_id);

-- Enable Row Level Security
ALTER TABLE campaign_contact_attempts ENABLE ROW LEVEL SECURITY;

-- RLS policies for campaign_contact_attempts
CREATE POLICY "Users can view own campaign attempts" ON campaign_contact_attempts
FOR SELECT USING (
  campaign_id IN (SELECT id FROM campaigns WHERE user_id = auth.uid())
);

CREATE POLICY "System can insert campaign attempts" ON campaign_contact_attempts
FOR INSERT WITH CHECK (true);

CREATE POLICY "System can update campaign attempts" ON campaign_contact_attempts
FOR UPDATE USING (true);

-- Enable realtime for campaigns table
ALTER TABLE campaigns REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE campaigns;

-- Enable realtime for campaign_contact_attempts table
ALTER TABLE campaign_contact_attempts REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE campaign_contact_attempts;