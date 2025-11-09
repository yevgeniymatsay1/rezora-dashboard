-- Update 'warm_intro' state prompt for the expired-listing template to include a scarcity line
-- and fix minor typo 'endcall' -> 'end_call' inside the state_prompt if present.

-- 1) Safely update the default_settings.states array
UPDATE public.agent_templates AS t
SET default_settings = jsonb_set(
  t.default_settings,
  '{states}',
  (
    SELECT jsonb_agg(
      CASE 
        WHEN (elem->>'name') = 'warm_intro' THEN 
          -- Fix typo and append scarcity placeholder if not already present
          (
            (
              elem || jsonb_build_object(
                'state_prompt',
                -- First correct the typo if any, then append scarcity guidance
                REGEXP_REPLACE(COALESCE(elem->>'state_prompt',''), '\\bendcall\\b', 'end_call', 'gi') ||
                E'\n\nAdd a brief scarcity note if appropriate: {{conversationFlow.scarcityLine}}'
              )
            )
          )
        ELSE elem
      END
    )
    FROM jsonb_array_elements(COALESCE(t.default_settings->'states', '[]'::jsonb)) AS elem
  ),
  false
)
WHERE t.template_type = 'expired-listing';

-- 2) Optionally fix the same typo in base_prompt for the same template (no other changes)
UPDATE public.agent_templates
SET base_prompt = REGEXP_REPLACE(base_prompt, '\\bendcall\\b', 'end_call', 'gi')
WHERE template_type = 'expired-listing' AND base_prompt ILIKE '%endcall%';