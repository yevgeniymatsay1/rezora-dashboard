-- Update agent templates to use {{USER_BACKGROUND_SECTION}} placeholder
UPDATE agent_templates 
SET base_prompt = REPLACE(
  base_prompt, 
  '## Background about User
- First Name: {{first_name}}
- Last Name: {{last_name}}
- Property Address: {{property_address}} 
- City: {{city}}
- State: {{state}}
- Phone Number: {{phone_number}}',
  '{{USER_BACKGROUND_SECTION}}'
)
WHERE base_prompt LIKE '%## Background about User%';

-- Also handle variations with different formatting
UPDATE agent_templates 
SET base_prompt = REPLACE(
  REPLACE(
    REPLACE(base_prompt, '## Background about User
- First Name: {{first_name}}
- Last Name: {{last_name}}
- Property Address: {{property_address}} 
- City: {{city}}
- State: {{state}}
- Phone Number: {{phone_number}}', '{{USER_BACKGROUND_SECTION}}'),
    '## Background about User
- First Name: {{First Name}}
- Last Name: {{Last Name}}
- Property Address: {{Property Address}} 
- City: {{City}}
- State: {{State}}
- Phone Number: {{Phone Number}}', '{{USER_BACKGROUND_SECTION}}'
  ),
  '##Background about User
- First Name: {{first_name}}
- Last Name: {{last_name}}
- Property Address: {{property_address}} 
- City: {{city}}
- State: {{state}}
- Phone Number: {{phone_number}}', '{{USER_BACKGROUND_SECTION}}'
)
WHERE base_prompt LIKE '%Background about User%';