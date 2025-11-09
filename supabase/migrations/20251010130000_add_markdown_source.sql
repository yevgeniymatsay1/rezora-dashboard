-- Add markdown_source column to prompt_versions
-- This stores the original markdown output from the LLM before compilation to Retell format

ALTER TABLE public.prompt_versions
ADD COLUMN markdown_source TEXT;

COMMENT ON COLUMN public.prompt_versions.markdown_source IS 'Original markdown output from LLM with sections (# BASE_PROMPT, # WARM_INTRO, etc.) before compilation to Retell format. Useful for human-readable editing and version control.';

-- Add index for faster markdown source retrieval
CREATE INDEX IF NOT EXISTS idx_prompt_versions_markdown_source_not_null
ON public.prompt_versions(id)
WHERE markdown_source IS NOT NULL;
