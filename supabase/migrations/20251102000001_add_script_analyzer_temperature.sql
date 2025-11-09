-- Add script_analyzer_temperature setting to prompt_factory_settings
-- This enables configurable temperature for the Script Analyzer LLM (Phase 2.1)

-- Add the column with default value
ALTER TABLE public.prompt_factory_settings
ADD COLUMN IF NOT EXISTS script_analyzer_temperature NUMERIC DEFAULT 0.2 CHECK (script_analyzer_temperature >= 0 AND script_analyzer_temperature <= 1);

-- Drop existing functions first (required to change return type)
DROP FUNCTION IF EXISTS public.get_prompt_factory_settings(UUID);
DROP FUNCTION IF EXISTS public.upsert_prompt_factory_settings(UUID, NUMERIC, TEXT, NUMERIC, NUMERIC);

-- Update the get_prompt_factory_settings function to include new field
CREATE OR REPLACE FUNCTION public.get_prompt_factory_settings(target_user_id UUID)
RETURNS TABLE (
  generator_temperature NUMERIC,
  generator_system_prompt TEXT,
  question_generator_temperature NUMERIC,
  refinement_temperature NUMERIC,
  script_analyzer_temperature NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(s.generator_temperature, 0.2) as generator_temperature,
    s.generator_system_prompt,
    COALESCE(s.question_generator_temperature, 0.2) as question_generator_temperature,
    COALESCE(s.refinement_temperature, 0.1) as refinement_temperature,
    COALESCE(s.script_analyzer_temperature, 0.2) as script_analyzer_temperature
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
      0.2::NUMERIC as script_analyzer_temperature;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the upsert function to include new field
CREATE OR REPLACE FUNCTION public.upsert_prompt_factory_settings(
  target_user_id UUID,
  new_generator_temperature NUMERIC DEFAULT NULL,
  new_generator_system_prompt TEXT DEFAULT NULL,
  new_question_generator_temperature NUMERIC DEFAULT NULL,
  new_refinement_temperature NUMERIC DEFAULT NULL,
  new_script_analyzer_temperature NUMERIC DEFAULT NULL
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
    script_analyzer_temperature
  )
  VALUES (
    target_user_id,
    COALESCE(new_generator_temperature, 0.2),
    new_generator_system_prompt,
    COALESCE(new_question_generator_temperature, 0.2),
    COALESCE(new_refinement_temperature, 0.1),
    COALESCE(new_script_analyzer_temperature, 0.2)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    generator_temperature = COALESCE(new_generator_temperature, prompt_factory_settings.generator_temperature),
    generator_system_prompt = COALESCE(new_generator_system_prompt, prompt_factory_settings.generator_system_prompt),
    question_generator_temperature = COALESCE(new_question_generator_temperature, prompt_factory_settings.question_generator_temperature),
    refinement_temperature = COALESCE(new_refinement_temperature, prompt_factory_settings.refinement_temperature),
    script_analyzer_temperature = COALESCE(new_script_analyzer_temperature, prompt_factory_settings.script_analyzer_temperature)
  RETURNING * INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the tracking function to track script_analyzer_temperature changes
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

  -- Only insert if there were actual changes
  IF change_record != '{}'::jsonb THEN
    INSERT INTO public.prompt_factory_settings_history (settings_id, changed_by, changes)
    VALUES (NEW.id, auth.uid(), change_record);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON COLUMN public.prompt_factory_settings.script_analyzer_temperature IS 'Temperature for Script Analyzer LLM (0.0-1.0). Used when analyzing example conversation scripts.';
