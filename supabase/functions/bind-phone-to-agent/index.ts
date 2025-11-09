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

    const { phone_number_id, agent_id } = await req.json()
    
    // Get the agent
    const { data: agentData, error: agentError } = await supabase
      .from('user_agents')
      .select('retell_agent_id')
      .eq('id', agent_id)
      .eq('user_id', user.id)
      .single()
      
    if (agentError || !agentData) {
      return new Response(JSON.stringify({ error: 'Agent not found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!agentData.retell_agent_id) {
      return new Response(JSON.stringify({ error: 'Agent is not properly configured' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get the phone number
    const { data: phoneData, error: phoneError } = await supabase
      .from('phone_numbers')
      .select('phone_number, retell_phone_id')
      .eq('id', phone_number_id)
      .eq('user_id', user.id)
      .single()
      
    if (phoneError || !phoneData) {
      return new Response(JSON.stringify({ error: 'Phone number not found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!phoneData.retell_phone_id) {
      return new Response(JSON.stringify({ 
        error: 'Phone number is not properly synced with Retell. Please try syncing phone numbers.' 
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

    // Call Retell API to bind phone number to agent
    // IMPORTANT: Always use the actual phone number, not retell_phone_id (which might be wrong)
    const response = await fetch(`https://api.retellai.com/update-phone-number/${phoneData.phone_number}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        outbound_agent_id: agentData.retell_agent_id
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Failed to bind phone number to agent via Retell API:', errorText)
      const userFriendlyError = parseRetellError(errorText, 'phone number binding');
      return new Response(JSON.stringify({ 
        error: userFriendlyError
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Update phone_numbers table to reference the agent
    const { error: updateError } = await supabase
      .from('phone_numbers')
      .update({ agent_id: agent_id })
      .eq('id', phone_number_id)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Failed to update phone number record:', updateError)
      return new Response(JSON.stringify({ 
        error: 'Failed to update phone number record' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Phone number successfully bound to agent'
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