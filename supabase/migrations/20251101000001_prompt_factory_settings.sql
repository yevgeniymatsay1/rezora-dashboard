-- Add Prompt Factory configuration settings support
-- This migration adds the ability to configure LLM parameters and system prompts via frontend

-- Create prompt_factory_settings table
CREATE TABLE IF NOT EXISTS public.prompt_factory_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  generator_temperature NUMERIC DEFAULT 0.2 CHECK (generator_temperature >= 0 AND generator_temperature <= 1),
  generator_system_prompt TEXT,
  question_generator_temperature NUMERIC DEFAULT 0.2 CHECK (question_generator_temperature >= 0 AND question_generator_temperature <= 1),
  refinement_temperature NUMERIC DEFAULT 0.1 CHECK (refinement_temperature >= 0 AND refinement_temperature <= 1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create prompt_factory_settings_history table for version tracking
CREATE TABLE IF NOT EXISTS public.prompt_factory_settings_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settings_id UUID REFERENCES public.prompt_factory_settings(id) ON DELETE CASCADE NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  changes JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_prompt_factory_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_prompt_factory_settings_updated_at_trigger
  BEFORE UPDATE ON public.prompt_factory_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_prompt_factory_settings_updated_at();

-- Create function to track setting changes in history
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

  -- Only insert if there were actual changes
  IF change_record != '{}'::jsonb THEN
    INSERT INTO public.prompt_factory_settings_history (settings_id, changed_by, changes)
    VALUES (NEW.id, auth.uid(), change_record);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for tracking changes
CREATE TRIGGER track_prompt_factory_settings_changes_trigger
  AFTER UPDATE ON public.prompt_factory_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.track_prompt_factory_settings_changes();

-- Create function to get settings (with defaults if not exist)
CREATE OR REPLACE FUNCTION public.get_prompt_factory_settings(target_user_id UUID)
RETURNS TABLE (
  generator_temperature NUMERIC,
  generator_system_prompt TEXT,
  question_generator_temperature NUMERIC,
  refinement_temperature NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(s.generator_temperature, 0.2) as generator_temperature,
    s.generator_system_prompt,
    COALESCE(s.question_generator_temperature, 0.2) as question_generator_temperature,
    COALESCE(s.refinement_temperature, 0.1) as refinement_temperature
  FROM public.prompt_factory_settings s
  WHERE s.user_id = target_user_id;

  -- If no settings found, return defaults
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      0.2::NUMERIC as generator_temperature,
      NULL::TEXT as generator_system_prompt,
      0.2::NUMERIC as question_generator_temperature,
      0.1::NUMERIC as refinement_temperature;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to upsert settings
CREATE OR REPLACE FUNCTION public.upsert_prompt_factory_settings(
  target_user_id UUID,
  new_generator_temperature NUMERIC DEFAULT NULL,
  new_generator_system_prompt TEXT DEFAULT NULL,
  new_question_generator_temperature NUMERIC DEFAULT NULL,
  new_refinement_temperature NUMERIC DEFAULT NULL
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
    refinement_temperature
  )
  VALUES (
    target_user_id,
    COALESCE(new_generator_temperature, 0.2),
    new_generator_system_prompt,
    COALESCE(new_question_generator_temperature, 0.2),
    COALESCE(new_refinement_temperature, 0.1)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    generator_temperature = COALESCE(new_generator_temperature, prompt_factory_settings.generator_temperature),
    generator_system_prompt = COALESCE(new_generator_system_prompt, prompt_factory_settings.generator_system_prompt),
    question_generator_temperature = COALESCE(new_question_generator_temperature, prompt_factory_settings.question_generator_temperature),
    refinement_temperature = COALESCE(new_refinement_temperature, prompt_factory_settings.refinement_temperature)
  RETURNING * INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS
ALTER TABLE public.prompt_factory_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_factory_settings_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for prompt_factory_settings
CREATE POLICY "Users can view own settings" ON public.prompt_factory_settings
  FOR SELECT
  USING (
    auth.uid() = user_id OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Users can insert own settings" ON public.prompt_factory_settings
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Users can update own settings" ON public.prompt_factory_settings
  FOR UPDATE
  USING (
    auth.uid() = user_id OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    auth.uid() = user_id OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- RLS Policies for prompt_factory_settings_history
CREATE POLICY "Users can view own settings history" ON public.prompt_factory_settings_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.prompt_factory_settings s
      WHERE s.id = settings_id
      AND (s.user_id = auth.uid() OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
    )
  );

-- Grant permissions
GRANT ALL ON public.prompt_factory_settings TO authenticated;
GRANT ALL ON public.prompt_factory_settings_history TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_prompt_factory_settings(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_prompt_factory_settings(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_prompt_factory_settings(UUID, NUMERIC, TEXT, NUMERIC, NUMERIC) TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE public.prompt_factory_settings IS 'Configuration settings for Prompt Factory LLM parameters and system prompts';
COMMENT ON TABLE public.prompt_factory_settings_history IS 'Version history of Prompt Factory settings changes';
COMMENT ON COLUMN public.prompt_factory_settings.generator_temperature IS 'Temperature for Generator LLM (0.0-1.0). Higher = more creative.';
COMMENT ON COLUMN public.prompt_factory_settings.generator_system_prompt IS 'Custom system prompt for Generator LLM. If null, uses hardcoded default.';
COMMENT ON COLUMN public.prompt_factory_settings.question_generator_temperature IS 'Temperature for Question Generator LLM (0.0-1.0)';
COMMENT ON COLUMN public.prompt_factory_settings.refinement_temperature IS 'Temperature for Refinement LLM (0.0-1.0)';
COMMENT ON FUNCTION public.get_prompt_factory_settings(UUID) IS 'Retrieves settings for a user with defaults if not configured';
COMMENT ON FUNCTION public.upsert_prompt_factory_settings(UUID, NUMERIC, TEXT, NUMERIC, NUMERIC) IS 'Creates or updates Prompt Factory settings. Requires admin role or self-update.';
