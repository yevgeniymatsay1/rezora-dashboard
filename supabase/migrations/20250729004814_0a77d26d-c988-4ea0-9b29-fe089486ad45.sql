-- User credits and balance tracking
CREATE TABLE user_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  balance_cents INTEGER DEFAULT 0, -- Current balance in cents
  total_purchased_cents INTEGER DEFAULT 0, -- Total credits ever purchased
  total_spent_cents INTEGER DEFAULT 0, -- Total credits ever spent
  last_topped_up TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Credit transactions log
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('purchase', 'usage', 'refund', 'bonus')),
  amount_cents INTEGER NOT NULL, -- Positive for credits added, negative for usage
  balance_after_cents INTEGER NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}', -- Store stripe_payment_intent_id, call_id, campaign_id, etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Call costs tracking
CREATE TABLE call_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_contact_attempt_id UUID REFERENCES campaign_contact_attempts NOT NULL,
  retell_cost_cents INTEGER NOT NULL, -- Actual cost from Retell
  user_cost_cents INTEGER NOT NULL, -- Cost charged to user (with markup)
  call_duration_seconds INTEGER,
  cost_breakdown JSONB DEFAULT '{}', -- Store Retell's detailed cost breakdown
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Credit packages for purchase
CREATE TABLE credit_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  credits_cents INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  stripe_price_id TEXT UNIQUE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add paused_reason column to campaigns table
ALTER TABLE campaigns ADD COLUMN paused_reason TEXT;

-- Add indexes for performance
CREATE INDEX idx_credit_transactions_user ON credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_type ON credit_transactions(type);
CREATE INDEX idx_call_costs_attempt ON call_costs(campaign_contact_attempt_id);
CREATE INDEX idx_user_credits_user ON user_credits(user_id);

-- Enable RLS on new tables
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_packages ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_credits
CREATE POLICY "Users can view own credits" ON user_credits
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own credits" ON user_credits
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "System can manage user credits" ON user_credits
  FOR ALL USING (true);

-- RLS policies for credit_transactions
CREATE POLICY "Users can view own transactions" ON credit_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert transactions" ON credit_transactions
  FOR INSERT WITH CHECK (true);

-- RLS policies for call_costs
CREATE POLICY "Users can view own call costs" ON call_costs
  FOR SELECT USING (
    campaign_contact_attempt_id IN (
      SELECT cca.id FROM campaign_contact_attempts cca
      JOIN campaigns c ON c.id = cca.campaign_id
      WHERE c.user_id = auth.uid()
    )
  );

CREATE POLICY "System can manage call costs" ON call_costs
  FOR ALL USING (true);

-- RLS policies for credit_packages
CREATE POLICY "Anyone can view active packages" ON credit_packages
  FOR SELECT USING (is_active = true);

CREATE POLICY "System can manage packages" ON credit_packages
  FOR ALL USING (true);

-- Insert default credit packages
INSERT INTO credit_packages (name, credits_cents, price_cents, stripe_price_id) VALUES
  ('Starter Pack', 1000, 1000, 'price_starter'), -- $10 for $10 credits
  ('Growth Pack', 2500, 2250, 'price_growth'), -- $22.50 for $25 credits (10% bonus)
  ('Pro Pack', 5000, 4250, 'price_pro'), -- $42.50 for $50 credits (15% bonus)
  ('Enterprise Pack', 10000, 8000, 'price_enterprise'); -- $80 for $100 credits (20% bonus)

-- Create function to initialize user credits
CREATE OR REPLACE FUNCTION initialize_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_credits (user_id, balance_cents)
  VALUES (NEW.id, 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to initialize credits for new users
CREATE TRIGGER on_auth_user_created_init_credits
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION initialize_user_credits();