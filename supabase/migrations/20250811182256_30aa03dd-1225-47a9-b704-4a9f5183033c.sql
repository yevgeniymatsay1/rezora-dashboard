-- Fix the expired listing specialist template by adding the missing states using dollar quoting
UPDATE agent_templates 
SET default_settings = jsonb_set(
  default_settings,
  '{states}',
  (
    COALESCE(default_settings->'states', '[]'::jsonb) ||
    $JSON$[
      {
        "name": "schedule_meeting",
        "state_prompt": "## Background\nBusiness Hours: Monday to Friday 9am-5pm EST.\nCurrent time is {{current_time}}, you cannot schedule a demo that's in the past.\n\n## Task\n1. Ask user when they are available for a quick virtual 30 minute meeting.\n- If not available for a meeting or hesitant, reassure them. Explain how there is no pressure and how it could only benefit them.\n- If still no, ask if we can have one of our associates reach out via a phone call instead.\n2. Ask the user to confirm their name and phone number.\n3. Call function check_availability to check for availability in the user provided time range.\n - if availability exists for user selected time range, inform user about the availability (date, time, timezone) and ask user to choose from it. Make sure user chose a slot within detailed available slot.\n - if availability exists for a nearby time, inform user that there're availability nearby. Inform user about the date, and time.\n - if availability does not exist, ask user to select another time range for the appointment, repeat from step 2.\n4. Confirm the date, time, and timezone selected by user: \"Just to confirm, you want to book the appointment at ...\". Make sure this is a time from the available slots.\n5. Once confirmed, call function book_appointment to book the appointment.\n - if booking returned booking detail, it means booking is successful, proceed.\n - if booking returned error message, let user know why the booking was not successful, and start over from step 1.\n6. If the booking is successful, let user know and ask if user have any questions. Answer them if you know the answers.\n - If user do not have any questions, call function end_call to hang up.",
        "edges": [],
        "tools": []
      },
      {
        "name": "callback",
        "state_prompt": "## Background\nBusiness Hour: Monday to Friday 9am-5pm PDT.\nCurrent time is {{current_time}}, you cannot schedule a callback that's in the past.\n\n## Task\n1. Ask user when is a good time to schedule a callback.\n2. Check if the user provided time is within business hours.\n - if not, go back to step 1 to get a time.\n3. Let user know the callback is scheduled, and call function end_call to hang up.",
        "edges": [],
        "tools": []
      }
    ]$JSON$::jsonb
  )
)
WHERE template_type = 'expired_listing_specialist';