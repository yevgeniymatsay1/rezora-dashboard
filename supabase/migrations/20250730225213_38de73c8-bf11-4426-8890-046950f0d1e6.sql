UPDATE agent_templates 
SET default_settings = jsonb_set(
  default_settings, 
  '{starting_state}', 
  '"warm_intro"'
)
WHERE template_type = 'landlord-qualification';