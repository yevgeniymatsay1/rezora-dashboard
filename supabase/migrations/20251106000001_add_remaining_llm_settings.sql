-- Add remaining LLM settings to prompt_factory_settings
-- This enables configurable temperature + system prompts for:
-- - Critic LLM (analyzes call transcripts)
-- - Pattern Extractor LLM (extracts learnings from evaluations)
-- - Placeholder Analyzer LLM (suggests placeholders)
-- - Metadata Assessor LLM (evaluates metadata quality)

-- Add the columns with default values
ALTER TABLE public.prompt_factory_settings
ADD COLUMN IF NOT EXISTS critic_temperature NUMERIC DEFAULT 0.1 CHECK (critic_temperature >= 0 AND critic_temperature <= 1),
ADD COLUMN IF NOT EXISTS critic_system_prompt TEXT,
ADD COLUMN IF NOT EXISTS pattern_extractor_temperature NUMERIC DEFAULT 0.1 CHECK (pattern_extractor_temperature >= 0 AND pattern_extractor_temperature <= 1),
ADD COLUMN IF NOT EXISTS pattern_extractor_system_prompt TEXT,
ADD COLUMN IF NOT EXISTS placeholder_analyzer_temperature NUMERIC DEFAULT 0.1 CHECK (placeholder_analyzer_temperature >= 0 AND placeholder_analyzer_temperature <= 1),
ADD COLUMN IF NOT EXISTS placeholder_analyzer_system_prompt TEXT,
ADD COLUMN IF NOT EXISTS metadata_assessor_temperature NUMERIC DEFAULT 0.1 CHECK (metadata_assessor_temperature >= 0 AND metadata_assessor_temperature <= 1),
ADD COLUMN IF NOT EXISTS metadata_assessor_system_prompt TEXT;

-- Drop existing functions first (required to change return type)
DROP FUNCTION IF EXISTS public.get_prompt_factory_settings(UUID);
DROP FUNCTION IF EXISTS public.upsert_prompt_factory_settings(UUID, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC);

-- Update the get_prompt_factory_settings function to include new fields
CREATE OR REPLACE FUNCTION public.get_prompt_factory_settings(target_user_id UUID)
RETURNS TABLE (
  generator_temperature NUMERIC,
  generator_system_prompt TEXT,
  question_generator_temperature NUMERIC,
  refinement_temperature NUMERIC,
  script_analyzer_temperature NUMERIC,
  critic_temperature NUMERIC,
  critic_system_prompt TEXT,
  pattern_extractor_temperature NUMERIC,
  pattern_extractor_system_prompt TEXT,
  placeholder_analyzer_temperature NUMERIC,
  placeholder_analyzer_system_prompt TEXT,
  metadata_assessor_temperature NUMERIC,
  metadata_assessor_system_prompt TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(s.generator_temperature, 0.2) as generator_temperature,
    s.generator_system_prompt,
    COALESCE(s.question_generator_temperature, 0.2) as question_generator_temperature,
    COALESCE(s.refinement_temperature, 0.1) as refinement_temperature,
    COALESCE(s.script_analyzer_temperature, 0.2) as script_analyzer_temperature,
    COALESCE(s.critic_temperature, 0.1) as critic_temperature,
    s.critic_system_prompt,
    COALESCE(s.pattern_extractor_temperature, 0.1) as pattern_extractor_temperature,
    s.pattern_extractor_system_prompt,
    COALESCE(s.placeholder_analyzer_temperature, 0.1) as placeholder_analyzer_temperature,
    s.placeholder_analyzer_system_prompt,
    COALESCE(s.metadata_assessor_temperature, 0.1) as metadata_assessor_temperature,
    s.metadata_assessor_system_prompt
  FROM public.prompt_factory_settings s
  WHERE s.user_id = target_user_id;

  -- If no settings found, return defaults
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      0.2::NUMERIC as generator_temperature,
      NULL::TEXT as generator_system_prompt,
      0.2::NUMERIC as question_generator_temperature,
      0.1::NUMERIC as refinement_temperature,
      0.2::NUMERIC as script_analyzer_temperature,
      0.1::NUMERIC as critic_temperature,
      NULL::TEXT as critic_system_prompt,
      0.1::NUMERIC as pattern_extractor_temperature,
      NULL::TEXT as pattern_extractor_system_prompt,
      0.1::NUMERIC as placeholder_analyzer_temperature,
      NULL::TEXT as placeholder_analyzer_system_prompt,
      0.1::NUMERIC as metadata_assessor_temperature,
      NULL::TEXT as metadata_assessor_system_prompt;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the upsert function to include new fields
CREATE OR REPLACE FUNCTION public.upsert_prompt_factory_settings(
  target_user_id UUID,
  new_generator_temperature NUMERIC DEFAULT NULL,
  new_generator_system_prompt TEXT DEFAULT NULL,
  new_question_generator_temperature NUMERIC DEFAULT NULL,
  new_refinement_temperature NUMERIC DEFAULT NULL,
  new_script_analyzer_temperature NUMERIC DEFAULT NULL,
  new_critic_temperature NUMERIC DEFAULT NULL,
  new_critic_system_prompt TEXT DEFAULT NULL,
  new_pattern_extractor_temperature NUMERIC DEFAULT NULL,
  new_pattern_extractor_system_prompt TEXT DEFAULT NULL,
  new_placeholder_analyzer_temperature NUMERIC DEFAULT NULL,
  new_placeholder_analyzer_system_prompt TEXT DEFAULT NULL,
  new_metadata_assessor_temperature NUMERIC DEFAULT NULL,
  new_metadata_assessor_system_prompt TEXT DEFAULT NULL
)
RETURNS public.prompt_factory_settings AS $$
DECLARE
  result public.prompt_factory_settings;
  current_user_role public.app_role;
BEGIN
  -- Get current user's role
  SELECT role INTO current_user_role
  FROM public.profiles
  WHERE id = auth.uid();

  -- Only admins can update settings or users can update their own
  IF current_user_role != 'admin' AND auth.uid() != target_user_id THEN
    RAISE EXCEPTION 'Insufficient permissions to update settings';
  END IF;

  -- Upsert the settings
  INSERT INTO public.prompt_factory_settings (
    user_id,
    generator_temperature,
    generator_system_prompt,
    question_generator_temperature,
    refinement_temperature,
    script_analyzer_temperature,
    critic_temperature,
    critic_system_prompt,
    pattern_extractor_temperature,
    pattern_extractor_system_prompt,
    placeholder_analyzer_temperature,
    placeholder_analyzer_system_prompt,
    metadata_assessor_temperature,
    metadata_assessor_system_prompt
  )
  VALUES (
    target_user_id,
    COALESCE(new_generator_temperature, 0.2),
    new_generator_system_prompt,
    COALESCE(new_question_generator_temperature, 0.2),
    COALESCE(new_refinement_temperature, 0.1),
    COALESCE(new_script_analyzer_temperature, 0.2),
    COALESCE(new_critic_temperature, 0.1),
    new_critic_system_prompt,
    COALESCE(new_pattern_extractor_temperature, 0.1),
    new_pattern_extractor_system_prompt,
    COALESCE(new_placeholder_analyzer_temperature, 0.1),
    new_placeholder_analyzer_system_prompt,
    COALESCE(new_metadata_assessor_temperature, 0.1),
    new_metadata_assessor_system_prompt
  )
  ON CONFLICT (user_id) DO UPDATE SET
    generator_temperature = COALESCE(new_generator_temperature, prompt_factory_settings.generator_temperature),
    generator_system_prompt = COALESCE(new_generator_system_prompt, prompt_factory_settings.generator_system_prompt),
    question_generator_temperature = COALESCE(new_question_generator_temperature, prompt_factory_settings.question_generator_temperature),
    refinement_temperature = COALESCE(new_refinement_temperature, prompt_factory_settings.refinement_temperature),
    script_analyzer_temperature = COALESCE(new_script_analyzer_temperature, prompt_factory_settings.script_analyzer_temperature),
    critic_temperature = COALESCE(new_critic_temperature, prompt_factory_settings.critic_temperature),
    critic_system_prompt = COALESCE(new_critic_system_prompt, prompt_factory_settings.critic_system_prompt),
    pattern_extractor_temperature = COALESCE(new_pattern_extractor_temperature, prompt_factory_settings.pattern_extractor_temperature),
    pattern_extractor_system_prompt = COALESCE(new_pattern_extractor_system_prompt, prompt_factory_settings.pattern_extractor_system_prompt),
    placeholder_analyzer_temperature = COALESCE(new_placeholder_analyzer_temperature, prompt_factory_settings.placeholder_analyzer_temperature),
    placeholder_analyzer_system_prompt = COALESCE(new_placeholder_analyzer_system_prompt, prompt_factory_settings.placeholder_analyzer_system_prompt),
    metadata_assessor_temperature = COALESCE(new_metadata_assessor_temperature, prompt_factory_settings.metadata_assessor_temperature),
    metadata_assessor_system_prompt = COALESCE(new_metadata_assessor_system_prompt, prompt_factory_settings.metadata_assessor_system_prompt)
  RETURNING * INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the tracking function to track all new field changes
CREATE OR REPLACE FUNCTION public.track_prompt_factory_settings_changes()
RETURNS TRIGGER AS $$
DECLARE
  change_record JSONB;
BEGIN
  -- Build changes JSON comparing OLD and NEW
  change_record := jsonb_build_object();

  IF OLD.generator_temperature IS DISTINCT FROM NEW.generator_temperature THEN
    change_record := change_record || jsonb_build_object(
      'generator_temperature', jsonb_build_object('old', OLD.generator_temperature, 'new', NEW.generator_temperature)
    );
  END IF;

  IF OLD.generator_system_prompt IS DISTINCT FROM NEW.generator_system_prompt THEN
    change_record := change_record || jsonb_build_object(
      'generator_system_prompt', jsonb_build_object(
        'old', LEFT(OLD.generator_system_prompt, 200),
        'new', LEFT(NEW.generator_system_prompt, 200)
      )
    );
  END IF;

  IF OLD.question_generator_temperature IS DISTINCT FROM NEW.question_generator_temperature THEN
    change_record := change_record || jsonb_build_object(
      'question_generator_temperature', jsonb_build_object('old', OLD.question_generator_temperature, 'new', NEW.question_generator_temperature)
    );
  END IF;

  IF OLD.refinement_temperature IS DISTINCT FROM NEW.refinement_temperature THEN
    change_record := change_record || jsonb_build_object(
      'refinement_temperature', jsonb_build_object('old', OLD.refinement_temperature, 'new', NEW.refinement_temperature)
    );
  END IF;

  IF OLD.script_analyzer_temperature IS DISTINCT FROM NEW.script_analyzer_temperature THEN
    change_record := change_record || jsonb_build_object(
      'script_analyzer_temperature', jsonb_build_object('old', OLD.script_analyzer_temperature, 'new', NEW.script_analyzer_temperature)
    );
  END IF;

  -- New: Critic LLM
  IF OLD.critic_temperature IS DISTINCT FROM NEW.critic_temperature THEN
    change_record := change_record || jsonb_build_object(
      'critic_temperature', jsonb_build_object('old', OLD.critic_temperature, 'new', NEW.critic_temperature)
    );
  END IF;

  IF OLD.critic_system_prompt IS DISTINCT FROM NEW.critic_system_prompt THEN
    change_record := change_record || jsonb_build_object(
      'critic_system_prompt', jsonb_build_object(
        'old', LEFT(OLD.critic_system_prompt, 200),
        'new', LEFT(NEW.critic_system_prompt, 200)
      )
    );
  END IF;

  -- New: Pattern Extractor
  IF OLD.pattern_extractor_temperature IS DISTINCT FROM NEW.pattern_extractor_temperature THEN
    change_record := change_record || jsonb_build_object(
      'pattern_extractor_temperature', jsonb_build_object('old', OLD.pattern_extractor_temperature, 'new', NEW.pattern_extractor_temperature)
    );
  END IF;

  IF OLD.pattern_extractor_system_prompt IS DISTINCT FROM NEW.pattern_extractor_system_prompt THEN
    change_record := change_record || jsonb_build_object(
      'pattern_extractor_system_prompt', jsonb_build_object(
        'old', LEFT(OLD.pattern_extractor_system_prompt, 200),
        'new', LEFT(NEW.pattern_extractor_system_prompt, 200)
      )
    );
  END IF;

  -- New: Placeholder Analyzer
  IF OLD.placeholder_analyzer_temperature IS DISTINCT FROM NEW.placeholder_analyzer_temperature THEN
    change_record := change_record || jsonb_build_object(
      'placeholder_analyzer_temperature', jsonb_build_object('old', OLD.placeholder_analyzer_temperature, 'new', NEW.placeholder_analyzer_temperature)
    );
  END IF;

  IF OLD.placeholder_analyzer_system_prompt IS DISTINCT FROM NEW.placeholder_analyzer_system_prompt THEN
    change_record := change_record || jsonb_build_object(
      'placeholder_analyzer_system_prompt', jsonb_build_object(
        'old', LEFT(OLD.placeholder_analyzer_system_prompt, 200),
        'new', LEFT(NEW.placeholder_analyzer_system_prompt, 200)
      )
    );
  END IF;

  -- New: Metadata Assessor
  IF OLD.metadata_assessor_temperature IS DISTINCT FROM NEW.metadata_assessor_temperature THEN
    change_record := change_record || jsonb_build_object(
      'metadata_assessor_temperature', jsonb_build_object('old', OLD.metadata_assessor_temperature, 'new', NEW.metadata_assessor_temperature)
    );
  END IF;

  IF OLD.metadata_assessor_system_prompt IS DISTINCT FROM NEW.metadata_assessor_system_prompt THEN
    change_record := change_record || jsonb_build_object(
      'metadata_assessor_system_prompt', jsonb_build_object(
        'old', LEFT(OLD.metadata_assessor_system_prompt, 200),
        'new', LEFT(NEW.metadata_assessor_system_prompt, 200)
      )
    );
  END IF;

  -- Only insert if there were actual changes
  IF change_record != '{}'::jsonb THEN
    INSERT INTO public.prompt_factory_settings_history (settings_id, changed_by, changes)
    VALUES (NEW.id, auth.uid(), change_record);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON COLUMN public.prompt_factory_settings.critic_temperature IS 'Temperature for Critic LLM (0.0-1.0). Used when analyzing call transcripts for quality.';
COMMENT ON COLUMN public.prompt_factory_settings.critic_system_prompt IS 'Custom system prompt for Critic LLM. If null, uses default prompt.';
COMMENT ON COLUMN public.prompt_factory_settings.pattern_extractor_temperature IS 'Temperature for Pattern Extractor LLM (0.0-1.0). Used when extracting learning patterns from evaluations.';
COMMENT ON COLUMN public.prompt_factory_settings.pattern_extractor_system_prompt IS 'Custom system prompt for Pattern Extractor LLM. If null, uses default prompt.';
COMMENT ON COLUMN public.prompt_factory_settings.placeholder_analyzer_temperature IS 'Temperature for Placeholder Analyzer LLM (0.0-1.0). Used when suggesting placeholders for prompts.';
COMMENT ON COLUMN public.prompt_factory_settings.placeholder_analyzer_system_prompt IS 'Custom system prompt for Placeholder Analyzer LLM. If null, uses default prompt.';
COMMENT ON COLUMN public.prompt_factory_settings.metadata_assessor_temperature IS 'Temperature for Metadata Assessor LLM (0.0-1.0). Used when evaluating metadata quality during generation.';
COMMENT ON COLUMN public.prompt_factory_settings.metadata_assessor_system_prompt IS 'Custom system prompt for Metadata Assessor LLM. If null, uses default prompt.';
