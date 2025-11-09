
-- One-time patch: replace legacy default "John" with templated "{Realtor'sName}" in saved agent configurations

-- Update in customizations JSON
UPDATE public.user_agents
SET customizations = jsonb_set(
  COALESCE(customizations, '{}'::jsonb),
  '{conversationFlow,followUpOffer}',
  to_jsonb('Offer to have {Realtor''sName} call when in their area'),
  true
)
WHERE customizations->'conversationFlow'->>'followUpOffer' = 'Offer to have John call when in their area';

-- Update in settings JSON (if also stored there)
UPDATE public.user_agents
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{conversationFlow,followUpOffer}',
  to_jsonb('Offer to have {Realtor''sName} call when in their area'),
  true
)
WHERE settings->'conversationFlow'->>'followUpOffer' = 'Offer to have John call when in their area';
