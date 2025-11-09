-- Enable Row Level Security on all tables
-- This migration enables RLS and creates policies to ensure users can only access their own data

-- Enable RLS on all user-related tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_contact_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_subscription_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_call_costs ENABLE ROW LEVEL SECURITY;

-- System tables (read-only for users)
ALTER TABLE public.agent_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_packages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (for clean slate)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own phone numbers" ON public.phone_numbers;
DROP POLICY IF EXISTS "Users can manage own phone numbers" ON public.phone_numbers;
DROP POLICY IF EXISTS "Users can view own agents" ON public.user_agents;
DROP POLICY IF EXISTS "Users can manage own agents" ON public.user_agents;
DROP POLICY IF EXISTS "Users can view own contact groups" ON public.contact_groups;
DROP POLICY IF EXISTS "Users can manage own contact groups" ON public.contact_groups;
DROP POLICY IF EXISTS "Users can view own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can manage own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can view own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users can manage own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users can view own call records" ON public.call_records;
DROP POLICY IF EXISTS "Users can view own campaign attempts" ON public.campaign_contact_attempts;
DROP POLICY IF EXISTS "Users can view own campaign contacts" ON public.campaign_contacts;
DROP POLICY IF EXISTS "Users can view own credits" ON public.user_credits;
DROP POLICY IF EXISTS "Users can view own credit transactions" ON public.credit_transactions;
DROP POLICY IF EXISTS "Users can view own call costs" ON public.call_costs;
DROP POLICY IF EXISTS "Users can view own phone subscriptions" ON public.phone_subscription_transactions;
DROP POLICY IF EXISTS "Users can view own web calls" ON public.web_call_sessions;
DROP POLICY IF EXISTS "Users can manage own web calls" ON public.web_call_sessions;
DROP POLICY IF EXISTS "Users can view own web call costs" ON public.web_call_costs;

-- Profiles policies
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Phone numbers policies
CREATE POLICY "Users can view own phone numbers"
  ON public.phone_numbers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own phone numbers"
  ON public.phone_numbers FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- User agents policies
CREATE POLICY "Users can view own agents"
  ON public.user_agents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own agents"
  ON public.user_agents FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Contact groups policies
CREATE POLICY "Users can view own contact groups"
  ON public.contact_groups FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own contact groups"
  ON public.contact_groups FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Contacts policies (must belong to user's contact group)
CREATE POLICY "Users can view own contacts"
  ON public.contacts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.contact_groups
      WHERE contact_groups.id = contacts.contact_group_id
      AND contact_groups.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage own contacts"
  ON public.contacts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.contact_groups
      WHERE contact_groups.id = contacts.contact_group_id
      AND contact_groups.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.contact_groups
      WHERE contact_groups.id = contacts.contact_group_id
      AND contact_groups.user_id = auth.uid()
    )
  );

-- Campaigns policies
CREATE POLICY "Users can view own campaigns"
  ON public.campaigns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own campaigns"
  ON public.campaigns FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Call records policies (must belong to user's campaign)
CREATE POLICY "Users can view own call records"
  ON public.call_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE campaigns.id = call_records.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

-- Campaign contact attempts policies
CREATE POLICY "Users can view own campaign attempts"
  ON public.campaign_contact_attempts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE campaigns.id = campaign_contact_attempts.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

-- Campaign contacts policies
CREATE POLICY "Users can view own campaign contacts"
  ON public.campaign_contacts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE campaigns.id = campaign_contacts.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

-- User credits policies
CREATE POLICY "Users can view own credits"
  ON public.user_credits FOR SELECT
  USING (auth.uid() = user_id);

-- Credit transactions policies
CREATE POLICY "Users can view own credit transactions"
  ON public.credit_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- Call costs policies
CREATE POLICY "Users can view own call costs"
  ON public.call_costs FOR SELECT
  USING (auth.uid() = user_id);

-- Phone subscription transactions policies
CREATE POLICY "Users can view own phone subscriptions"
  ON public.phone_subscription_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- Web call sessions policies
CREATE POLICY "Users can view own web calls"
  ON public.web_call_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own web calls"
  ON public.web_call_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Web call costs policies
CREATE POLICY "Users can view own web call costs"
  ON public.web_call_costs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.web_call_sessions
      WHERE web_call_sessions.id = web_call_costs.session_id
      AND web_call_sessions.user_id = auth.uid()
    )
  );

-- Agent templates policies (read-only for all authenticated users)
CREATE POLICY "Authenticated users can view templates"
  ON public.agent_templates FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Credit packages policies (read-only for all authenticated users)
CREATE POLICY "Authenticated users can view packages"
  ON public.credit_packages FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Service role bypass policies for Edge Functions
-- These allow service role to bypass RLS for administrative operations

CREATE POLICY "Service role has full access to profiles"
  ON public.profiles FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role has full access to phone_numbers"
  ON public.phone_numbers FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role has full access to user_agents"
  ON public.user_agents FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role has full access to campaigns"
  ON public.campaigns FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role has full access to call_records"
  ON public.call_records FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role has full access to campaign_contact_attempts"
  ON public.campaign_contact_attempts FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role has full access to user_credits"
  ON public.user_credits FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role has full access to credit_transactions"
  ON public.credit_transactions FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role has full access to call_costs"
  ON public.call_costs FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- Create indexes for performance on RLS lookups
CREATE INDEX IF NOT EXISTS idx_contact_groups_user_id ON public.contact_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON public.campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_user_agents_user_id ON public.user_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_user_id ON public.phone_numbers(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_contact_group_id ON public.contacts(contact_group_id);
CREATE INDEX IF NOT EXISTS idx_call_records_campaign_id ON public.call_records(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_contact_attempts_campaign_id ON public.campaign_contact_attempts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign_id ON public.campaign_contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON public.user_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_call_costs_user_id ON public.call_costs(user_id);
CREATE INDEX IF NOT EXISTS idx_web_call_sessions_user_id ON public.web_call_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_web_call_costs_session_id ON public.web_call_costs(session_id);

-- Grant necessary permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.phone_numbers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_agents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT SELECT ON public.call_records TO authenticated;
GRANT SELECT ON public.campaign_contact_attempts TO authenticated;
GRANT SELECT ON public.campaign_contacts TO authenticated;
GRANT SELECT ON public.user_credits TO authenticated;
GRANT SELECT ON public.credit_transactions TO authenticated;
GRANT SELECT ON public.call_costs TO authenticated;
GRANT SELECT ON public.phone_subscription_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.web_call_sessions TO authenticated;
GRANT SELECT ON public.web_call_costs TO authenticated;
GRANT SELECT ON public.agent_templates TO authenticated;
GRANT SELECT ON public.credit_packages TO authenticated;

-- Comment on the migration
COMMENT ON SCHEMA public IS 'Row Level Security enabled for all user tables to ensure data isolation';