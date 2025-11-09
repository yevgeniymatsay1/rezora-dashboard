UPDATE user_agents 
SET customizations = jsonb_set(
  customizations, 
  '{voice,selectedVoice}', 
  '"11labs-Adrian"'
)
WHERE id = '2809d2f3-86fc-42cf-8c27-7c8dd08bd3aa' 
AND customizations->'voice'->>'selectedVoice' NOT IN (
  '11labs-Adrian', '11labs-Anna', '11labs-Andrew', '11labs-Bing', 
  '11labs-Brian', '11labs-Emily', '11labs-Evie', '11labs-Grace', 
  '11labs-James', '11labs-Kathrine'
);