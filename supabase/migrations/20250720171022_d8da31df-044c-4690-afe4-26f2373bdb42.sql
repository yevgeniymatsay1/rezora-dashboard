
-- Create custom types
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'user');
CREATE TYPE public.phone_status AS ENUM ('active', 'inactive');
CREATE TYPE public.contact_group_status AS ENUM ('active', 'paused', 'completed');
CREATE TYPE public.campaign_status AS ENUM ('active', 'paused', 'completed', 'scheduled');
CREATE TYPE public.call_status AS ENUM ('completed', 'failed', 'busy', 'no-answer', 'in-progress');
CREATE TYPE public.sentiment_type AS ENUM ('positive', 'neutral', 'negative');

-- Create profiles table (extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT,
  first_name TEXT,
  last_name TEXT,
  role public.app_role DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create phone_numbers table
CREATE TABLE public.phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  phone_number TEXT NOT NULL,
  area_code TEXT NOT NULL,
  retell_phone_id TEXT UNIQUE,
  agent_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status public.phone_status DEFAULT 'active'
);

-- Create agent_templates table
CREATE TABLE public.agent_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  template_type TEXT NOT NULL,
  base_prompt TEXT NOT NULL,
  default_settings JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_agents table
CREATE TABLE public.user_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  template_id UUID REFERENCES public.agent_templates(id),
  retell_agent_id TEXT UNIQUE,
  retell_llm_id TEXT,
  phone_number_id UUID REFERENCES public.phone_numbers(id),
  name TEXT NOT NULL,
  customizations JSONB DEFAULT '{}',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

-- Create contact_groups table
CREATE TABLE public.contact_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status public.contact_group_status DEFAULT 'active'
);

-- Create contacts table
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES public.contact_groups(id) ON DELETE CASCADE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone_number TEXT NOT NULL,
  email TEXT,
  address TEXT,
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create campaigns table  
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  agent_id UUID REFERENCES public.user_agents(id),
  contact_group_id UUID REFERENCES public.contact_groups(id),
  status public.campaign_status DEFAULT 'scheduled',
  schedule_config JSONB DEFAULT '{}',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create call_records table
CREATE TABLE public.call_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id),
  contact_id UUID REFERENCES public.contacts(id),
  agent_id UUID REFERENCES public.user_agents(id),
  retell_call_id TEXT UNIQUE,
  phone_number TEXT NOT NULL,
  status public.call_status NOT NULL,
  duration INTEGER,
  sentiment public.sentiment_type,
  transcript TEXT,
  recording_url TEXT,
  metadata JSONB DEFAULT '{}',
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create function to handle updated_at timestamps
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  return NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at columns
CREATE TRIGGER handle_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER handle_agent_templates_updated_at BEFORE UPDATE ON public.agent_templates FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER handle_user_agents_updated_at BEFORE UPDATE ON public.user_agents FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER handle_contact_groups_updated_at BEFORE UPDATE ON public.contact_groups FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER handle_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER handle_campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'first_name', NEW.raw_user_meta_data ->> 'last_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Enable Row Level Security on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS Policies for phone_numbers
CREATE POLICY "Users can manage own phone numbers" ON public.phone_numbers FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for agent_templates (public read access)
CREATE POLICY "Anyone can view active templates" ON public.agent_templates FOR SELECT USING (is_active = true);

-- RLS Policies for user_agents
CREATE POLICY "Users can manage own agents" ON public.user_agents FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for contact_groups  
CREATE POLICY "Users can manage own contact groups" ON public.contact_groups FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for contacts
CREATE POLICY "Users can manage contacts in own groups" ON public.contacts FOR ALL USING (
  group_id IN (SELECT id FROM public.contact_groups WHERE user_id = auth.uid())
);

-- RLS Policies for campaigns
CREATE POLICY "Users can manage own campaigns" ON public.campaigns FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for call_records
CREATE POLICY "Users can view own call records" ON public.call_records FOR SELECT USING (
  campaign_id IN (SELECT id FROM public.campaigns WHERE user_id = auth.uid())
);

-- Insert default agent templates
INSERT INTO public.agent_templates (name, description, template_type, base_prompt, default_settings) VALUES
(
  'Real Estate Agent',
  'Perfect for listing presentations and buyer/seller qualification calls',
  'real-estate-general',
  'You are a professional real estate agent helping clients with buying and selling properties. Be helpful, knowledgeable, and focus on building trust.',
  '{"voice_speed": "normal", "personality": "professional", "call_duration_limit": 300}'
),
(
  'Expired Listing Specialist', 
  'Specialized for reaching out to homeowners whose listings have expired',
  'expired-listing',
  'You are calling homeowners whose property listing recently expired. Be empathetic and offer solutions to help them sell their home.',
  '{"voice_speed": "normal", "personality": "empathetic", "call_duration_limit": 600}'
),
(
  'FSBO (For Sale By Owner) Agent',
  'Optimized for contacting homeowners selling their property without an agent',
  'fsbo',
  'You are reaching out to homeowners selling their property by themselves. Offer valuable insights and assistance without being pushy.',
  '{"voice_speed": "normal", "personality": "helpful", "call_duration_limit": 450}'
),
(
  'Real Estate Investor',
  'Designed for investment property outreach and portfolio building',
  'investor',
  'You are a real estate investor looking for investment opportunities. Focus on numbers, ROI, and building relationships with property owners.',
  '{"voice_speed": "normal", "personality": "analytical", "call_duration_limit": 400}'
),
(
  'Real Estate Wholesaler',
  'Specialized for off-market property acquisition and investor outreach', 
  'wholesaler',
  'You are a real estate wholesaler looking for distressed properties and connecting with investors. Be direct and focus on quick deals.',
  '{"voice_speed": "fast", "personality": "direct", "call_duration_limit": 300}'
);
