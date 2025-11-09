import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getRetellApiKeyForFunction } from '../_shared/retell-api-key.ts';
import { parseRetellError, validateCalComCredentials, isCalComError } from '../_shared/retell-error-parser.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function buildGeneralTools(customConfig: any): any[] {
  const tools = [
    {
      type: "end_call",
      name: "end_call",
      description: ""
    }
  ];

  // Add transfer call tool if enabled (supports nested and flat formats)
  const flatTransferEnabled = (customConfig.enableCallTransfer || customConfig.enableTransfer) && customConfig.transferPhoneNumber;
  const nestedTransferEnabled = customConfig.integrations?.transfer?.enabled && customConfig.integrations?.transfer?.phoneNumber;
  if (nestedTransferEnabled || flatTransferEnabled) {
    const number = customConfig.integrations?.transfer?.phoneNumber || customConfig.transferPhoneNumber;
    tools.push({
      type: "transfer_call",
      name: "transfer_call",
      transfer_destination: {
        type: "predefined",
        number
      },
      transfer_option: {
        type: "cold_transfer"
      }
    });
  }

  // Add Cal.com tools if enabled (supports nested and multiple flat formats)
  const nestedCal = customConfig.integrations?.calcom;
  const apiKeyFlat = customConfig.calApiKey || customConfig.calComApiKey;
  const eventTypeIdFlat = customConfig.calEventTypeId || customConfig.calComEventTypeId;
  const timezoneFlat = customConfig.calTimezone || customConfig.calComTimezone;
  const flatCalEnabled = (customConfig.enableCalIntegration || customConfig.enableCalCom) && apiKeyFlat && eventTypeIdFlat;
  const nestedCalEnabled = nestedCal?.enabled && nestedCal?.apiKey && nestedCal?.eventTypeId;
  if (nestedCalEnabled || flatCalEnabled) {
    const apiKey = nestedCal?.apiKey || apiKeyFlat;
    const eventTypeIdRaw = nestedCal?.eventTypeId || eventTypeIdFlat;
    const eventTypeId = typeof eventTypeIdRaw === 'string' ? parseInt(eventTypeIdRaw) : Number(eventTypeIdRaw);
    const timezone = nestedCal?.timezone || timezoneFlat || "America/New_York";

    const maskedKey = apiKey ? `${String(apiKey).slice(0, 6)}...` : 'none';
    console.log('Adding Cal.com tools. Event ID:', eventTypeId, 'Timezone:', timezone, 'API key:', maskedKey);

    // Add check availability tool
    tools.push({
      type: "check_availability_cal",
      name: "check_availability_cal",
      description: "When users ask for availability, or want to schedule an appointment, check the calendar and provide available slots.",
      cal_api_key: apiKey,
      event_type_id: eventTypeId,
      timezone
    });

    // Add book appointment tool
    tools.push({
      type: "book_appointment_cal",
      name: "book_appointment_cal",
      description: "When users ask to book an appointment, or after users select a time slot from the calendar book it on the calendar.",
      cal_api_key: apiKey,
      event_type_id: eventTypeId,
      timezone
    });
  }

  return tools;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Get user from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header provided');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: authHeader
          }
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Authentication failed');
    }

    const { agentId, dynamicPrompt, integrations } = await req.json();

    if (!agentId || !dynamicPrompt) {
      return new Response(JSON.stringify({ error: 'Agent ID and dynamic prompt are required' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the agent with Retell IDs
    const { data: agent, error: agentError } = await supabase
      .from('user_agents')
      .select('*')
      .eq('id', agentId)
      .eq('user_id', user.id)
      .single();

    if (agentError || !agent) {
      return new Response(JSON.stringify({ error: 'Agent not found or access denied' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!agent.retell_llm_id) {
      return new Response(JSON.stringify({ error: 'Agent does not have a Retell LLM ID' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user-specific or global Retell API key
    const retellApiKey = await getRetellApiKeyForFunction(user.id);
    if (!retellApiKey) {
      return new Response(JSON.stringify({ error: 'Retell API key not configured' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build request body for Retell LLM update
    const requestBody: any = {
      general_prompt: dynamicPrompt
    };

    // Only send tools if integrations were explicitly provided (to avoid overwriting existing tools)  
    if (typeof integrations !== 'undefined' && integrations !== null) {
      console.log('update-retell-llm: Integrations provided, updating tools', {
        hasCalCom: integrations?.enableCalCom || integrations?.enableCalIntegration,
        calComApiKey: integrations?.calComApiKey ? 'present' : 'missing'
      });
      
      // Validate Cal.com credentials if enabled
      if (integrations?.enableCalCom || integrations?.calcom?.enabled || integrations?.calComApiKey) {
        const apiKey = integrations?.calcom?.apiKey || integrations?.calComApiKey;
        const eventTypeId = integrations?.calcom?.eventTypeId || integrations?.calComEventTypeId;
        const calValidationError = validateCalComCredentials(apiKey, eventTypeId);
        if (calValidationError) {
          return new Response(JSON.stringify({ error: calValidationError }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      const generalTools = buildGeneralTools(integrations);
      requestBody.general_tools = generalTools;
      console.log('update-retell-llm: Sending tools to Retell:', generalTools.length, 'tools');
    } else {
      console.log('update-retell-llm: No integrations provided, skipping tools update to preserve existing configuration');
    }

    // Update Retell LLM with the dynamic prompt (and tools when provided)
    const llmResponse = await fetch(`https://api.retellai.com/update-retell-llm/${agent.retell_llm_id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error('Failed to update Retell LLM:', errorText);
      const userFriendlyError = parseRetellError(errorText, 'LLM update');
      return new Response(JSON.stringify({ 
        error: userFriendlyError
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const llmData = await llmResponse.json();
    console.log(`Successfully updated Retell LLM for agent ${agentId}`);

    // Update agent status to track LLM update
    const { error: updateError } = await supabase
      .from('user_agents')
      .update({
        prompt_updated_at: new Date().toISOString()
      })
      .eq('id', agentId);

    if (updateError) {
      console.warn('Failed to update agent prompt timestamp:', updateError);
    }

    return new Response(JSON.stringify({
      success: true,
      llm_data: llmData,
      message: 'Retell LLM updated successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in update-retell-llm function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      details: 'Failed to update Retell LLM'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});