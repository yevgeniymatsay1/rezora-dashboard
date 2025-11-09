UPDATE agent_templates 
SET default_settings = jsonb_set(
  default_settings, 
  '{conversationFlow,reason_for_calling}', 
  '"Mention you''re looking for a place in their area"'
)
WHERE template_type = 'landlord-qualification';