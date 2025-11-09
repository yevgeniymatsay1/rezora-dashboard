-- Ensure prompt versions increment uniquely per session

WITH duplicates AS (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY session_id, version_number
        ORDER BY created_at DESC NULLS LAST, id DESC
      ) AS row_number
    FROM public.prompt_versions
  ) ranked
  WHERE ranked.row_number > 1
)
DELETE FROM public.prompt_versions
WHERE id IN (SELECT id FROM duplicates);

ALTER TABLE public.prompt_versions
ADD CONSTRAINT prompt_versions_session_version_unique
UNIQUE (session_id, version_number);

COMMENT ON CONSTRAINT prompt_versions_session_version_unique ON public.prompt_versions
IS 'Enforces monotonically increasing version numbers per prompt generation session.';
