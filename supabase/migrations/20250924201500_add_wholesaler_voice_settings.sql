-- Add missing voice and agent configuration settings to wholesaler template
UPDATE public.agent_templates
SET default_settings = default_settings ||
'{
  "voice_id": "11labs-Adrian",
  "voice_temperature": 1.0,
  "voice_speed": 0.92,
  "volume": 1.0,
  "responsiveness": 0.8,
  "interruption_sensitivity": 0.8,
  "enable_backchannel": true,
  "reminder_trigger_ms": 10000,
  "reminder_max_count": 2,
  "ambient_sound": null,
  "ambient_sound_volume": 0.5,
  "language": "en-US",
  "normalize_for_speech": true,
  "end_call_after_silence_ms": 600000,
  "max_call_duration_ms": 3600000,
  "begin_message_delay_ms": 1000,
  "voicemail_option": null
}'::jsonb
WHERE template_type = 'wholesaler'
  AND (default_settings->>'voice_speed' IS NULL
    OR default_settings->>'voice_temperature' IS NULL
    OR default_settings->>'voice_id' IS NULL);