-- Fix for agents with NULL configured_prompt
-- This populates the configured_prompt for existing agents using their dynamic_prompt
-- or falls back to the template's base_prompt

-- First, let's update agents that have dynamic_prompt but no configured_prompt
-- by extracting the user's configured portion (everything before {USER_BACKGROUND_SECTION})
UPDATE user_agents 
SET configured_prompt = CASE 
  WHEN dynamic_prompt IS NOT NULL AND dynamic_prompt != '' THEN 
    -- Extract the part before {USER_BACKGROUND_SECTION} or use the whole prompt if no section found
    CASE 
      WHEN position('{USER_BACKGROUND_SECTION}' in dynamic_prompt) > 0 THEN
        substring(dynamic_prompt from 1 for position('{USER_BACKGROUND_SECTION}' in dynamic_prompt) - 1) || '{USER_BACKGROUND_SECTION}'
      ELSE
        dynamic_prompt || E'\n\n{USER_BACKGROUND_SECTION}'
    END
  ELSE 
    -- Fall back to template base_prompt with placeholder
    (SELECT base_prompt || E'\n\n{USER_BACKGROUND_SECTION}' 
     FROM agent_templates 
     WHERE agent_templates.id = user_agents.template_id)
END
WHERE configured_prompt IS NULL OR configured_prompt = '';

-- Clear the cache keys to force regeneration
UPDATE user_agents 
SET prompt_cache_key = NULL, 
    dynamic_prompt = NULL,
    prompt_updated_at = now()
WHERE configured_prompt IS NOT NULL;