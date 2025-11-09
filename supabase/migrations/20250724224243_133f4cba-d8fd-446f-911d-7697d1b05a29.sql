UPDATE agent_templates 
SET base_prompt = REPLACE(base_prompt, '{Brokerage/Company Name}', '{BrokerageName}')
WHERE template_type = 'expired-listing' AND base_prompt LIKE '%{Brokerage/Company Name}%';