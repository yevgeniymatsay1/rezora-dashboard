-- Fix RLS policy for prompt_factory_settings_history
-- The trigger needs to be able to INSERT into this table

-- Add INSERT policy for the trigger to work
CREATE POLICY "Allow trigger to insert history" ON public.prompt_factory_settings_history
  FOR INSERT
  WITH CHECK (
    -- Allow insert if the settings record belongs to the user or they're admin
    EXISTS (
      SELECT 1 FROM public.prompt_factory_settings s
      WHERE s.id = settings_id
      AND (s.user_id = auth.uid() OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
    )
  );

COMMENT ON POLICY "Allow trigger to insert history" ON public.prompt_factory_settings_history IS
  'Allows the track_prompt_factory_settings_changes trigger to insert audit records';
