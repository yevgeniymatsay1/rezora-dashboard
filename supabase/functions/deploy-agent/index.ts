
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getRetellApiKeyForFunction } from '../_shared/retell-api-key.ts'
import { parseRetellError } from '../_shared/retell-error-parser.ts'

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
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { agent_id, phone_number_id } = await req.json()
    
    // Get the draft agent
    const { data: draftAgent } = await supabase
      .from('user_agents')
      .select('*')
      .eq('id', agent_id)
      .eq('user_id', user.id)
      .eq('status', 'draft')
      .single()
      
    if (!draftAgent) {
      return new Response(JSON.stringify({ error: 'Draft agent not found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get the phone number
    const { data: phoneNumber } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('id', phone_number_id)
      .eq('user_id', user.id)
      .single()
      
    if (!phoneNumber) {
      return new Response(JSON.stringify({ error: 'Phone number not found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate that the phone number has a retell_phone_id
    if (!phoneNumber.retell_phone_id) {
      return new Response(JSON.stringify({ 
        error: 'Phone number is not properly synced with Retell. Please contact support or try purchasing a new number.' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get user-specific or global Retell API key
    const retellApiKey = await getRetellApiKeyForFunction(user.id)
    if (!retellApiKey) {
      return new Response(JSON.stringify({ error: 'Retell API key not configured' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate that the agent exists in Retell
    if (!draftAgent.retell_agent_id) {
      return new Response(JSON.stringify({ error: 'Agent is not properly configured. Please try again.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate that the phone number exists in Retell API
    const phoneCheckResponse = await fetch(`https://api.retellai.com/get-phone-number/${phoneNumber.retell_phone_id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!phoneCheckResponse.ok) {
      console.error('Phone number validation failed:', phoneCheckResponse.status)
      return new Response(JSON.stringify({ 
        error: 'Selected phone number is not available in Retell. Please try syncing your phone numbers or contact support.' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Archive any existing deployed agents for this template
    await supabase
      .from('user_agents')
      .update({ status: 'archived' })
      .eq('user_id', user.id)
      .eq('template_id', draftAgent.template_id)
      .eq('status', 'deployed')

    // Update phone number to bind to the agent
    // IMPORTANT: Always use the actual phone number, not retell_phone_id (which might be wrong)
    const phoneUpdateResponse = await fetch(`https://api.retellai.com/update-phone-number/${phoneNumber.phone_number}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        outbound_agent_id: draftAgent.retell_agent_id
      })
    })

    if (!phoneUpdateResponse.ok) {
      const error = await phoneUpdateResponse.text()
      console.error('Failed to update phone number:', error)
      const userFriendlyError = parseRetellError(error, 'phone number binding');
      return new Response(JSON.stringify({ error: userFriendlyError }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Update agent status to deployed and bind phone number
    const { data: deployedAgent, error: deployError } = await supabase
      .from('user_agents')
      .update({
        status: 'deployed',
        phone_number_id: phone_number_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', agent_id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (deployError) {
      console.error('Database error:', deployError)
      return new Response(JSON.stringify({ error: 'Failed to deploy agent' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Update phone number to reference the agent
    await supabase
      .from('phone_numbers')
      .update({ agent_id: agent_id })
      .eq('id', phone_number_id)
      .eq('user_id', user.id)

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Agent deployed successfully'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
