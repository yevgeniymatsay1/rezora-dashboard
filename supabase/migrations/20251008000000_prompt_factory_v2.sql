-- Prompt Factory V2: Conversational AI Prompt Generator with RAG
-- This migration creates tables for managing conversational prompt generation,
-- feedback analysis, learning patterns, and RAG-powered improvements.

-- ============================================================================
-- 1. Prompt Generation Sessions
-- ============================================================================
-- Tracks conversational sessions between user and Generator LLM
CREATE TABLE IF NOT EXISTS public.prompt_generation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  agent_type_name TEXT NOT NULL, -- e.g., "Commercial Real Estate Investor"
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'testing', 'finalized', 'archived')),
  conversation_history JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of {role, content, timestamp}
  metadata JSONB DEFAULT '{}'::jsonb, -- Store extracted info during conversation
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX prompt_generation_sessions_user_id_idx ON public.prompt_generation_sessions(user_id);
CREATE INDEX prompt_generation_sessions_status_idx ON public.prompt_generation_sessions(status);
CREATE INDEX prompt_generation_sessions_created_at_idx ON public.prompt_generation_sessions(created_at DESC);

-- Updated at trigger
CREATE TRIGGER handle_prompt_generation_sessions_updated_at
  BEFORE UPDATE ON public.prompt_generation_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 2. Prompt Versions
-- ============================================================================
-- Stores each iteration of generated prompts (versioning system)
CREATE TABLE IF NOT EXISTS public.prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.prompt_generation_sessions(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL, -- 1, 2, 3, etc.
  base_prompt TEXT NOT NULL, -- System/identity prompt
  states JSONB NOT NULL, -- Array: [warm_intro, schedule_meet]
  generation_context JSONB DEFAULT '{}'::jsonb, -- RAG docs used, user inputs, variant settings
  quality_score DECIMAL, -- Optional: automated quality assessment
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, version_number)
);

CREATE INDEX prompt_versions_session_id_idx ON public.prompt_versions(session_id);
CREATE INDEX prompt_versions_created_at_idx ON public.prompt_versions(created_at DESC);

-- ============================================================================
-- 3. Prompt Evaluations
-- ============================================================================
-- Stores transcript feedback and automated analysis
CREATE TABLE IF NOT EXISTS public.prompt_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_version_id UUID NOT NULL REFERENCES public.prompt_versions(id) ON DELETE CASCADE,
  transcript TEXT NOT NULL, -- Call transcript
  user_rating INTEGER NOT NULL CHECK (user_rating BETWEEN 1 AND 5),
  user_notes TEXT, -- User's subjective feedback
  automated_analysis JSONB, -- Critic LLM output: verbosity, closing, objections, etc.
  improvement_suggestions JSONB, -- Specific actionable improvements
  test_call_metadata JSONB DEFAULT '{}'::jsonb, -- Duration, outcome, agent_id, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX prompt_evaluations_prompt_version_id_idx ON public.prompt_evaluations(prompt_version_id);
CREATE INDEX prompt_evaluations_user_rating_idx ON public.prompt_evaluations(user_rating);
CREATE INDEX prompt_evaluations_created_at_idx ON public.prompt_evaluations(created_at DESC);

-- ============================================================================
-- 4. Learning Patterns
-- ============================================================================
-- Extracted patterns from feedback that feed into RAG Knowledge Base
CREATE TABLE IF NOT EXISTS public.learning_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type TEXT NOT NULL CHECK (pattern_type IN (
    'best_practice',
    'anti_pattern',
    'closing_technique',
    'objection_handling',
    'verbosity_rule',
    'tone_guidance',
    'conversation_flow',
    'other'
  )),
  agent_type_category TEXT, -- 'cold_call', 'warm_lead', 'all', null for universal
  pattern_summary TEXT NOT NULL, -- Human-readable summary
  pattern_details TEXT NOT NULL, -- Full description for RAG
  evidence_count INTEGER NOT NULL DEFAULT 1, -- Number of evaluations supporting this
  avg_rating_impact DECIMAL, -- Correlation with ratings (e.g., +1.5, -0.8)
  source_evaluation_ids UUID[] DEFAULT ARRAY[]::UUID[], -- Track which evaluations contributed
  s3_key TEXT, -- S3 path where pattern document is stored
  kb_synced BOOLEAN DEFAULT FALSE, -- Has been synced to Bedrock KB
  kb_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX learning_patterns_pattern_type_idx ON public.learning_patterns(pattern_type);
CREATE INDEX learning_patterns_agent_type_category_idx ON public.learning_patterns(agent_type_category);
CREATE INDEX learning_patterns_avg_rating_impact_idx ON public.learning_patterns(avg_rating_impact DESC NULLS LAST);
CREATE INDEX learning_patterns_kb_synced_idx ON public.learning_patterns(kb_synced);

-- Updated at trigger
CREATE TRIGGER handle_learning_patterns_updated_at
  BEFORE UPDATE ON public.learning_patterns
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 5. Placeholder Suggestions
-- ============================================================================
-- Auto-generated placeholder recommendations for finalized prompts
CREATE TABLE IF NOT EXISTS public.placeholder_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_version_id UUID NOT NULL REFERENCES public.prompt_versions(id) ON DELETE CASCADE,
  suggested_placeholders JSONB NOT NULL, -- Array of {semantic_key, token, description, label}
  suggested_editable_guidelines JSONB DEFAULT '[]'::jsonb, -- Conversation flow editables
  user_approved BOOLEAN DEFAULT FALSE,
  user_modifications JSONB, -- Any manual edits to suggestions
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(prompt_version_id) -- One suggestion set per version
);

CREATE INDEX placeholder_suggestions_prompt_version_id_idx ON public.placeholder_suggestions(prompt_version_id);
CREATE INDEX placeholder_suggestions_user_approved_idx ON public.placeholder_suggestions(user_approved);

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

ALTER TABLE public.prompt_generation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placeholder_suggestions ENABLE ROW LEVEL SECURITY;

-- Service role (edge functions) gets full access
CREATE POLICY "Service role can manage prompt_generation_sessions"
  ON public.prompt_generation_sessions
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role can manage prompt_versions"
  ON public.prompt_versions
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role can manage prompt_evaluations"
  ON public.prompt_evaluations
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role can manage learning_patterns"
  ON public.learning_patterns
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role can manage placeholder_suggestions"
  ON public.placeholder_suggestions
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- Allow session owners to view their own data
CREATE POLICY "Owners can view their prompt_generation_sessions"
  ON public.prompt_generation_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Owners can view their prompt_versions"
  ON public.prompt_versions
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.prompt_generation_sessions
    WHERE id = prompt_versions.session_id
    AND user_id = auth.uid()
  ));

CREATE POLICY "Owners can view their prompt_evaluations"
  ON public.prompt_evaluations
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.prompt_versions pv
    JOIN public.prompt_generation_sessions pgs ON pv.session_id = pgs.id
    WHERE pv.id = prompt_evaluations.prompt_version_id
    AND pgs.user_id = auth.uid()
  ));

-- ============================================================================
-- Grant Permissions
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.prompt_generation_sessions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.prompt_versions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.prompt_evaluations TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.learning_patterns TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.placeholder_suggestions TO authenticated, service_role;

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to get latest prompt version for a session
CREATE OR REPLACE FUNCTION public.get_latest_prompt_version(p_session_id UUID)
RETURNS public.prompt_versions
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_latest public.prompt_versions;
BEGIN
  SELECT * INTO v_latest
  FROM public.prompt_versions
  WHERE session_id = p_session_id
  ORDER BY version_number DESC
  LIMIT 1;

  RETURN v_latest;
END;
$$;

-- Function to calculate average rating for a prompt version
CREATE OR REPLACE FUNCTION public.get_prompt_version_avg_rating(p_version_id UUID)
RETURNS DECIMAL
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_avg DECIMAL;
BEGIN
  SELECT AVG(user_rating) INTO v_avg
  FROM public.prompt_evaluations
  WHERE prompt_version_id = p_version_id;

  RETURN COALESCE(v_avg, 0);
END;
$$;

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON TABLE public.prompt_generation_sessions IS 'Tracks conversational sessions for AI prompt generation';
COMMENT ON TABLE public.prompt_versions IS 'Stores each iteration of generated prompts with versioning';
COMMENT ON TABLE public.prompt_evaluations IS 'Stores transcript feedback and automated Critic LLM analysis';
COMMENT ON TABLE public.learning_patterns IS 'Extracted improvement patterns that feed into RAG Knowledge Base';
COMMENT ON TABLE public.placeholder_suggestions IS 'Auto-generated placeholder recommendations for user customization';

COMMENT ON COLUMN public.prompt_generation_sessions.conversation_history IS 'Array of messages: [{role: "user"|"assistant", content: string, timestamp: string}]';
COMMENT ON COLUMN public.prompt_versions.generation_context IS 'Stores: RAG docs retrieved, variant settings, user inputs used for generation';
COMMENT ON COLUMN public.prompt_evaluations.automated_analysis IS 'Critic LLM output: {verbosity_score, closing_effectiveness, objection_handling, unnatural_phrases, etc}';
COMMENT ON COLUMN public.learning_patterns.avg_rating_impact IS 'Positive = improves ratings, Negative = hurts ratings, based on correlation analysis';
COMMENT ON COLUMN public.placeholder_suggestions.suggested_placeholders IS 'Array: [{semantic_key, token, description, frontend_label, required}]';
