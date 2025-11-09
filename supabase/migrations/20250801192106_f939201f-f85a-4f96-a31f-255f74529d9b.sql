UPDATE agent_templates 
SET base_prompt = REPLACE(
  base_prompt, 
  'You are {AIAgentName}, a young {personalitytraits}, professional calling landlords to see if they''ll have any apartments available in the next month or two.',
  'You are {AIAgentName}, a young {personalitytraits}, calling Users (landlords) to see if they''ll have any apartments available in the next month or two.'
)
WHERE template_type = 'landlord-qualification';