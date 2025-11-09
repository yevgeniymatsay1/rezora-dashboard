
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getRetellApiKeyForFunction } from '../_shared/retell-api-key.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: authHeader ? { Authorization: authHeader } : {},
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get user-specific or global Retell API key
    const retellApiKey = await getRetellApiKeyForFunction(user.id)
    if (!retellApiKey) {
      return new Response(JSON.stringify({ error: 'Retell API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get all user's phone numbers from database
    const { data: dbPhoneNumbers, error: dbError } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('user_id', user.id)

    if (dbError) {
      console.error('Database error:', dbError)
      return new Response(JSON.stringify({ error: 'Failed to fetch phone numbers from database' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get all phone numbers from Retell API
    const retellResponse = await fetch('https://api.retellai.com/list-phone-numbers', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!retellResponse.ok) {
      const errorText = await retellResponse.text()
      console.error('Retell API error:', retellResponse.status, errorText)
      return new Response(JSON.stringify({ error: 'Failed to fetch phone numbers from Retell API' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const retellData = await retellResponse.json()
    const retellPhoneNumbers = retellData.phone_numbers || []
    
    // Log first phone to see structure
    if (retellPhoneNumbers.length > 0) {
      console.log('Sample Retell phone structure:', JSON.stringify(retellPhoneNumbers[0], null, 2))
    }

    let syncedCount = 0
    let updatedCount = 0

    // Check and update each database phone number
    for (const dbPhone of dbPhoneNumbers) {
      if (!dbPhone.retell_phone_id) {
        // Try to find matching phone number in Retell by phone number
        const matchingRetellPhone = retellPhoneNumbers.find(
          (rp: any) => rp.phone_number === dbPhone.phone_number
        )

        if (matchingRetellPhone) {
          // Update database with the phone number as retell_phone_id (Retell uses phone number as ID)
          const { error: updateError } = await supabase
            .from('phone_numbers')
            .update({ retell_phone_id: matchingRetellPhone.phone_number })
            .eq('id', dbPhone.id)

          if (!updateError) {
            updatedCount++
            console.log(`Updated phone number ${dbPhone.phone_number} with retell_phone_id: ${matchingRetellPhone.phone_number}`)
          } else {
            console.error('Error updating phone number:', updateError)
          }
        } else {
          console.log(`Phone number ${dbPhone.phone_number} not found in Retell API`)
        }
      } else {
        // Validate that the retell_phone_id still exists in Retell
        const retellPhone = retellPhoneNumbers.find(
          (rp: any) => rp.phone_id === dbPhone.retell_phone_id
        )

        if (retellPhone) {
          syncedCount++
        } else {
          console.log(`Phone number ${dbPhone.phone_number} with retell_phone_id ${dbPhone.retell_phone_id} not found in Retell API`)
          
          // Try to find by phone number and update retell_phone_id
          const matchingRetellPhone = retellPhoneNumbers.find(
            (rp: any) => rp.phone_number === dbPhone.phone_number
          )

          if (matchingRetellPhone) {
            const { error: updateError } = await supabase
              .from('phone_numbers')
              .update({ retell_phone_id: matchingRetellPhone.phone_id })
              .eq('id', dbPhone.id)

            if (!updateError) {
              updatedCount++
              console.log(`Fixed phone number ${dbPhone.phone_number} with new retell_phone_id: ${matchingRetellPhone.phone_id}`)
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      synced_count: syncedCount,
      updated_count: updatedCount,
      total_db_numbers: dbPhoneNumbers.length,
      total_retell_numbers: retellPhoneNumbers.length
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
