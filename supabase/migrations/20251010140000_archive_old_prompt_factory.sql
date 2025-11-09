-- Archive old Prompt Factory V1 tables
-- These are deprecated in favor of Prompt Factory V2 tables:
--   - prompt_generation_sessions
--   - prompt_versions
--   - prompt_evaluations
--   - learning_patterns
--   - placeholder_suggestions

-- Add archived column to old tables to mark them as deprecated
ALTER TABLE IF EXISTS public.lead_specs
ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT true;

ALTER TABLE IF EXISTS public.compiled_prompts
ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT true;

ALTER TABLE IF EXISTS public.compiler_feedback
ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT true;

-- Backfill existing rows as archived
UPDATE public.lead_specs SET archived = true WHERE archived IS NULL;
UPDATE public.compiled_prompts SET archived = true WHERE archived IS NULL;
UPDATE public.compiler_feedback SET archived = true WHERE archived IS NULL;

-- Add comments documenting deprecation
COMMENT ON TABLE public.lead_specs IS 'DEPRECATED: Use prompt_generation_sessions in Prompt Factory V2 instead. Kept for historical data only.';
COMMENT ON TABLE public.compiled_prompts IS 'DEPRECATED: Use prompt_versions in Prompt Factory V2 instead. Kept for historical data only.';
COMMENT ON TABLE public.compiler_feedback IS 'DEPRECATED: Use prompt_evaluations in Prompt Factory V2 instead. Kept for historical data only.';

COMMENT ON COLUMN public.lead_specs.archived IS 'Marks this table as deprecated. All rows are archived.';
COMMENT ON COLUMN public.compiled_prompts.archived IS 'Marks this table as deprecated. All rows are archived.';
COMMENT ON COLUMN public.compiler_feedback.archived IS 'Marks this table as deprecated. All rows are archived.';
