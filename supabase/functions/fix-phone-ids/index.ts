import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    console.log('Fixing phone IDs for user:', user.id)

    // Get all user's phone numbers
    const { data: phoneNumbers, error: fetchError } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('user_id', user.id)

    if (fetchError) {
      console.error('Error fetching phone numbers:', fetchError)
      return new Response(JSON.stringify({ error: 'Failed to fetch phone numbers' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let fixedCount = 0
    const results = []

    // Fix each phone number where retell_phone_id doesn't match phone_number
    for (const phone of phoneNumbers) {
      if (phone.retell_phone_id !== phone.phone_number) {
        console.log(`Fixing phone ${phone.phone_number}:`)
        console.log(`  - Old retell_phone_id: ${phone.retell_phone_id}`)
        console.log(`  - New retell_phone_id: ${phone.phone_number}`)
        
        const { error: updateError } = await supabase
          .from('phone_numbers')
          .update({ 
            retell_phone_id: phone.phone_number,
            updated_at: new Date().toISOString()
          })
          .eq('id', phone.id)

        if (updateError) {
          console.error(`Failed to fix phone ${phone.phone_number}:`, updateError)
          results.push({
            phone_number: phone.phone_number,
            status: 'error',
            error: updateError.message
          })
        } else {
          fixedCount++
          results.push({
            phone_number: phone.phone_number,
            status: 'fixed',
            old_id: phone.retell_phone_id,
            new_id: phone.phone_number
          })
        }
      } else {
        results.push({
          phone_number: phone.phone_number,
          status: 'already_correct'
        })
      }
    }

    console.log(`Fixed ${fixedCount} phone numbers out of ${phoneNumbers.length} total`)

    return new Response(JSON.stringify({ 
      success: true,
      fixed_count: fixedCount,
      total_count: phoneNumbers.length,
      results: results
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