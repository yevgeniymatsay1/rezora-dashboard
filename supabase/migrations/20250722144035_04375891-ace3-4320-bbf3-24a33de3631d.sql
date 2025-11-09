UPDATE agent_templates 
SET default_settings = '{
  "states": [
    {
      "name": "warm_intro",
      "state_prompt": "You are introducing yourself and the reason for your call. Be warm and professional.",
      "edges": [
        {
          "destination_state_name": "schedule_tour",
          "description": "User shows interest in scheduling a tour or meeting"
        },
        {
          "destination_state_name": "callback",
          "description": "User wants to schedule a callback for later"
        }
      ]
    },
    {
      "name": "schedule_tour",
      "state_prompt": "Help the user schedule a tour or meeting. Use the check_availability and book_appointment tools if Cal.com is integrated.",
      "edges": [
        {
          "destination_state_name": "callback",
          "description": "User wants to schedule a callback instead"
        }
      ],
      "tools": [
        {
          "type": "check_availability_cal",
          "name": "check_availability",
          "cal_api_key": "{{cal_api_key}}",
          "event_type_id": "{{event_type_id}}",
          "timezone": "{{timezone}}"
        },
        {
          "type": "book_appointment_cal",
          "name": "book_appointment",
          "cal_api_key": "{{cal_api_key}}",
          "event_type_id": "{{event_type_id}}",
          "timezone": "{{timezone}}"
        }
      ]
    },
    {
      "name": "callback",
      "state_prompt": "Schedule a callback time with the user. Be flexible with timing options.",
      "edges": []
    }
  ],
  "starting_state": "warm_intro",
  "voice_id": "11labs-Adrian",
  "voice_temperature": 1.0,
  "voice_speed": 1.0,
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
  "voicemail_option": null,
  "enableCallTransfer": false,
  "transferPhoneNumber": "",
  "enableCalIntegration": false,
  "calApiKey": "",
  "calEventId": "",
  "calTimezone": "America/New_York"
}'
WHERE template_type = 'expired-listing';