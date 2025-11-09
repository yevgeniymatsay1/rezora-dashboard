
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getRetellApiKeyForFunction } from '../_shared/retell-api-key.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper function to clean states for Retell API
function cleanStatesForRetell(states: any[]): any[] {
  if (!Array.isArray(states)) return []
  
  return states.map(state => {
    // Remove properties that shouldn't be sent to Retell API
    const { edges, tools, ...cleanState } = state
    return cleanState
  })
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
      console.error('No user found, auth header:', authHeader ? 'present' : 'missing')
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('User authenticated:', user.id)

    const { template_id } = await req.json()
    console.log('Creating draft agent for template:', template_id)
    
    // Check if draft agent already exists for this template
    const { data: existingDraft } = await supabase
      .from('user_agents')
      .select('*')
      .eq('user_id', user.id)
      .eq('template_id', template_id)
      .eq('status', 'draft')
      .maybeSingle()
      
    if (existingDraft) {
      console.log('Found existing draft agent:', existingDraft.id)
      
      // Validate that the Retell resources still exist
      const retellApiKey = await getRetellApiKeyForFunction(user.id)
      if (!retellApiKey) {
        console.error('Retell API key not configured')
        return new Response(JSON.stringify({ error: 'Retell API key not configured' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      let needsRecreation = false;

      // Check if LLM exists in Retell
      if (existingDraft.retell_llm_id) {
        try {
          const llmCheck = await fetch(`https://api.retellai.com/get-retell-llm/${existingDraft.retell_llm_id}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${retellApiKey}`,
            },
          })
          
          if (llmCheck.status === 404) {
            console.log('LLM not found in Retell, needs recreation')
            needsRecreation = true;
          }
        } catch (error) {
          console.error('Error checking LLM:', error)
          needsRecreation = true;
        }
      } else {
        needsRecreation = true;
      }

      // Check if Agent exists in Retell
      if (existingDraft.retell_agent_id && !needsRecreation) {
        try {
          const agentCheck = await fetch(`https://api.retellai.com/get-agent/${existingDraft.retell_agent_id}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${retellApiKey}`,
            },
          })
          
          if (agentCheck.status === 404) {
            console.log('Agent not found in Retell, needs recreation')
            needsRecreation = true;
          }
        } catch (error) {
          console.error('Error checking agent:', error)
          needsRecreation = true;
        }
      } else if (!existingDraft.retell_agent_id) {
        needsRecreation = true;
      }

      // If Retell resources exist, return the existing draft
      if (!needsRecreation) {
        console.log('Existing draft agent is valid, returning it')
        return new Response(JSON.stringify({ 
          success: true, 
          data: existingDraft 
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      console.log('Recreating Retell resources for existing draft agent')
      // Fall through to recreation logic below
    }

    // Get template details
    const { data: template, error: templateError } = await supabase
      .from('agent_templates')
      .select('*')
      .eq('id', template_id)
      .single()

    if (templateError) {
      console.error('Template fetch error:', templateError)
      return new Response(JSON.stringify({ error: 'Template not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('Found template:', template.name)

    // Get user-specific or global Retell API key
    const retellApiKey = await getRetellApiKeyForFunction(user.id)
    if (!retellApiKey) {
      console.error('Retell API key not configured')
      return new Response(JSON.stringify({ error: 'Retell API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('Creating LLM with Retell API...')
    
    // Clean states by removing edges and tools that shouldn't be sent to Retell
    const cleanStates = cleanStatesForRetell(template.default_settings?.states || []);

    // Create LLM first
    const llmResponse = await fetch('https://api.retellai.com/create-retell-llm', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        general_prompt: template.base_prompt,
        general_tools: [
          {
            type: 'end_call',
            name: 'end_call',
            description: ''
          }
        ],
        states: cleanStates,
        starting_state: template.default_settings?.starting_state || 'warm_intro',
        begin_message: null
      })
    })

    if (!llmResponse.ok) {
      const error = await llmResponse.text()
      console.error('Failed to create LLM:', error)
      return new Response(JSON.stringify({ error: 'Failed to create LLM' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const llmData = await llmResponse.json()
    console.log('LLM created:', llmData.llm_id)
    
    console.log('Creating agent with Retell API...')
    
    // Create Agent
    const agentResponse = await fetch('https://api.retellai.com/create-agent', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        response_engine: {
          type: 'retell-llm',
          llm_id: llmData.llm_id
        },
        voice_id: template.default_settings?.voice_id || '11labs-Adrian',
        agent_name: template.name,
        voice_model: 'eleven_turbo_v2_5',
        voice_temperature: template.default_settings?.voice_temperature || 1,
        voice_speed: template.default_settings?.voice_speed || 0.92,
        volume: template.default_settings?.volume || 1,
        language: 'en-US'
      })
    })

    if (!agentResponse.ok) {
      const error = await agentResponse.text()
      console.error('Failed to create agent:', error)
      return new Response(JSON.stringify({ error: 'Failed to create agent' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const agentData = await agentResponse.json()
    console.log('Agent created:', agentData.agent_id)

    console.log('Saving draft agent to database...')

    let draftAgent;
    
    if (existingDraft) {
      // Update existing draft with new Retell IDs
      const { data: updatedAgent, error: updateError } = await supabase
        .from('user_agents')
        .update({
          retell_llm_id: llmData.llm_id,
          retell_agent_id: agentData.agent_id,
        })
        .eq('id', existingDraft.id)
        .select()
        .single()

      if (updateError) {
        console.error('Database update error:', updateError)
        return new Response(JSON.stringify({ error: 'Failed to update draft agent' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      
      draftAgent = updatedAgent;
      console.log('Draft agent updated successfully:', draftAgent.id)
    } else {
      // Save new draft agent to database
      const { data: newAgent, error: dbError } = await supabase
        .from('user_agents')
        .insert({
          user_id: user.id,
          template_id: template_id,
          name: template.name,
          retell_llm_id: llmData.llm_id,
          retell_agent_id: agentData.agent_id,
          status: 'draft',
          customizations: template.default_settings || {},
          settings: template.default_settings || {}
        })
        .select()
        .single()

      if (dbError) {
        console.error('Database error:', dbError)
        return new Response(JSON.stringify({ error: 'Failed to save draft agent' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      
      draftAgent = newAgent;
      console.log('Draft agent saved successfully:', draftAgent.id)
    }

    return new Response(JSON.stringify({ 
      success: true, 
      data: draftAgent 
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
