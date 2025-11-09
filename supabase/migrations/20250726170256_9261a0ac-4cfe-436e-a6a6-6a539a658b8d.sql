-- Add configured_prompt column to user_agents table
ALTER TABLE public.user_agents 
ADD COLUMN configured_prompt text;

-- Update the agent template placeholder from {{USER_BACKGROUND_SECTION}} to {USER_BACKGROUND_SECTION}
UPDATE public.agent_templates 
SET base_prompt = REPLACE(base_prompt, '{{USER_BACKGROUND_SECTION}}', '{USER_BACKGROUND_SECTION}')
WHERE base_prompt LIKE '%{{USER_BACKGROUND_SECTION}}%';

-- Add comment to document the new column
COMMENT ON COLUMN public.user_agents.configured_prompt IS 'Stores the users fully configured prompt with all customizations applied, retaining {USER_BACKGROUND_SECTION} placeholder for campaign-specific field injection';