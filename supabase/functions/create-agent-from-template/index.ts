
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getRetellApiKeyForFunction } from '../_shared/retell-api-key.ts';
import { parseRetellError, validateCalComCredentials } from '../_shared/retell-error-parser.ts';
import { validateRequest, createAgentSchema, sanitizeHtml } from '../_shared/validation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// API key will be retrieved per user

function buildCustomizedPrompt(template: any, customConfig: any) {
  // Extract form data with defaults and sanitize inputs
  const agentName = sanitizeHtml(customConfig.agentName || "AI Assistant");
  const companyName = sanitizeHtml(customConfig.companyName || "the company");
  const realtorName = sanitizeHtml(customConfig.realtorName || "our team");
  const realtorLocation = sanitizeHtml(customConfig.realtorLocation || "");
  const yearsExperience = sanitizeHtml(customConfig.yearsExperience || "");
  const homesSold = sanitizeHtml(customConfig.homesSold || "");
  const areasServiced = sanitizeHtml(customConfig.areasServiced || "");
  
  const keyValuePoints = [
    customConfig.keyValuePoint1,
    customConfig.keyValuePoint2,
    customConfig.keyValuePoint3,
    customConfig.keyValuePoint4
  ].filter(point => point && point.trim()).map(point => `- ${point}`).join('\n');
  
  const personalityTraits = customConfig.personalityTraits || [];
  const communicationStyle = customConfig.communicationStyle || "Professional";
  const energyLevel = customConfig.energyLevel || "Moderate";
  
  let personalityDescription = "";
  if (personalityTraits.length > 0) {
    personalityDescription = `You should be ${personalityTraits.join(', ').toLowerCase()}`;
  }
  
  let realtorProfile = `You are calling on behalf of ${realtorName}`;
  if (realtorLocation) realtorProfile += ` based in ${realtorLocation}`;
  if (yearsExperience) realtorProfile += ` with ${yearsExperience} years of experience`;
  if (homesSold) realtorProfile += ` and ${homesSold} homes sold`;
  if (areasServiced) realtorProfile += `. We service ${areasServiced}`;
  
  const customizedPrompt = `You are ${agentName} from ${companyName}, calling users over the phone.

${realtorProfile}.

${keyValuePoints ? `Our key value propositions include:
${keyValuePoints}` : ''}

Communication Style: ${communicationStyle} approach with ${energyLevel.toLowerCase()} energy level.
${personalityDescription ? `Personality: ${personalityDescription}.` : ''}

${template.base_prompt}`;

  return customizedPrompt;
}

function buildGeneralTools(customConfig: any) {
  const tools = [
    {
      type: "end_call",
      name: "end_call",
      description: "End the call with user."
    }
  ];

  // Add call transfer tool if enabled
  if (customConfig.enableCallTransfer && customConfig.transferPhoneNumber) {
    tools.push({
      type: "transfer_call",
      name: "transfer_call",
      description: "Transfer call to human representative.",
      transfer_destination: {
        type: "predefined",
        number: customConfig.transferPhoneNumber
      },
      transfer_option: {
        type: "cold_transfer"
      }
    });
  }

  return tools;
}

function processStatesWithIntegrations(states: any[], customConfig: any) {
  if (!states || states.length === 0) {
    return [];
  }

  return states.map(state => {
    const processedState = { ...state };
    
    // Process tools in each state
    if (state.tools && state.tools.length > 0) {
      processedState.tools = state.tools
        .map((tool: any) => {
          // Always allow end_call tools
          if (tool.type === "end_call") {
            return tool;
          }
          
          // Handle call transfer tools - only include if integration is enabled
          if (tool.type === "transfer_call") {
            if (customConfig.enableCallTransfer && customConfig.transferPhoneNumber) {
              return {
                ...tool,
                transfer_destination: {
                  type: "predefined",
                  number: customConfig.transferPhoneNumber
                },
                transfer_option: {
                  type: "cold_transfer"
                }
              };
            } else {
              // Remove transfer tools if integration not enabled
              return null;
            }
          }
          
          // Handle Cal.com integration tools - only include if integration is enabled and configured
          if (tool.type === "check_availability_cal" || tool.type === "book_appointment_cal") {
            if (customConfig.enableCalIntegration && customConfig.calApiKey && customConfig.calEventId && customConfig.calTimezone) {
              return {
                ...tool,
                cal_api_key: customConfig.calApiKey,
                event_type_id: parseInt(customConfig.calEventId),
                timezone: customConfig.calTimezone
              };
            } else {
              // Remove Cal.com tools if integration not enabled or configured
              return null;
            }
          }
          
          // For any other tool type, include it as-is (this shouldn't happen with current templates)
          return tool;
        })
        .filter(tool => tool !== null); // Remove null tools
    }
    
    // If Cal.com integration is enabled but not in tools, add the tools to schedule_tour state
    if (state.name === "schedule_tour" && customConfig.enableCalIntegration && 
        customConfig.calApiKey && customConfig.calEventId && customConfig.calTimezone) {
      
      const hasCalTools = processedState.tools.some((tool: any) => 
        tool.type === "check_availability_cal" || tool.type === "book_appointment_cal"
      );
      
      if (!hasCalTools) {
        processedState.tools = processedState.tools || [];
        processedState.tools.push(
          {
            type: "check_availability_cal",
            name: "check_availability", 
            description: "Check availability for appointment booking.",
            cal_api_key: customConfig.calApiKey,
            event_type_id: parseInt(customConfig.calEventId),
            timezone: customConfig.calTimezone
          },
          {
            type: "book_appointment_cal",
            name: "book_appointment",
            description: "Book an appointment.",
            cal_api_key: customConfig.calApiKey,
            event_type_id: parseInt(customConfig.calEventId),
            timezone: customConfig.calTimezone
          }
        );
      }
    }
    
    return processedState;
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const requestBody = await req.json();
    const { templateId, agentName, ...customConfig } = requestBody;

    if (!templateId) {
      return new Response(
        JSON.stringify({ error: 'Template ID is required' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Creating agent from template ${templateId} for user ${user.id}`);

    // Get user-specific or global Retell API key
    const retellApiKey = await getRetellApiKeyForFunction(user.id);
    if (!retellApiKey) {
      return new Response(
        JSON.stringify({ error: 'Retell API key not configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: template, error: templateError } = await supabase
      .from('agent_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (templateError || !template) {
      return new Response(
        JSON.stringify({ error: 'Template not found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: phoneNumber, error: phoneError } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (phoneError || !phoneNumber) {
      return new Response(
        JSON.stringify({ error: 'No active phone number found. Please purchase a phone number first.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Creating Retell LLM with customized prompt...');

    // Validate Cal.com credentials if enabled
    if (customConfig.enableCalIntegration || customConfig.calApiKey) {
      const calValidationError = validateCalComCredentials(
        customConfig.calApiKey,
        customConfig.calEventId
      );
      if (calValidationError) {
        return new Response(
          JSON.stringify({ error: calValidationError }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const finalAgentName = agentName || template.name;
    const customizedPrompt = buildCustomizedPrompt(template, { agentName: finalAgentName, ...customConfig });
    
    // Build general tools based on integrations
    const generalTools = buildGeneralTools(customConfig);
    
    // Process states with integration data
    const processedStates = processStatesWithIntegrations(
      template.default_settings?.states || [], 
      customConfig
    );

    console.log('Customized prompt:', customizedPrompt);
    console.log('General tools:', JSON.stringify(generalTools, null, 2));
    console.log('Processed states:', JSON.stringify(processedStates, null, 2));

    // Create Retell LLM with processed data
    const llmPayload = {
      model: "gpt-4o",
      general_prompt: customizedPrompt,
      general_tools: generalTools,
      states: processedStates,
      starting_state: template.default_settings?.starting_state || "warm_intro",
      start_speaker: "agent",
      begin_message: null
    };

    const llmResponse = await fetch('https://api.retellai.com/create-retell-llm', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(llmPayload),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error('Retell LLM creation failed:', errorText);
      console.error('LLM payload that failed:', JSON.stringify(llmPayload, null, 2));
      const userFriendlyError = parseRetellError(errorText, 'LLM creation');
      return new Response(
        JSON.stringify({ error: userFriendlyError }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const llmData = await llmResponse.json();
    console.log('Retell LLM created:', llmData.llm_id);

    // Create Retell Agent with complete configuration
    console.log('Creating Retell Agent...');
    const agentResponse = await fetch('https://api.retellai.com/create-agent', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        response_engine: {
          type: "retell-llm",
          llm_id: llmData.llm_id
        },
        voice_id: customConfig.voiceId || "11labs-Adrian",
        agent_name: finalAgentName,
        voice_model: "eleven_turbo_v2_5",
        voice_temperature: customConfig.voiceTemperature || 1,
        voice_speed: customConfig.voiceSpeed || 0.92,
        volume: customConfig.volume || 1,
        language: "en-US",
        responsiveness: customConfig.responsiveness || 0.8,
        interruption_sensitivity: customConfig.interruptionSensitivity || 0.8,
        enable_backchannel: true,
        reminder_trigger_ms: 10000,
        reminder_max_count: 1,
        max_call_duration_ms: 3600000,
        normalize_for_speech: false,
        opt_out_sensitive_data_storage: false,
        post_call_analysis_model: "gpt-4o-mini",
        user_dtmf_options: {}
      }),
    });

    if (!agentResponse.ok) {
      const errorText = await agentResponse.text();
      console.error('Retell Agent creation failed:', errorText);
      const userFriendlyError = parseRetellError(errorText, 'agent creation');
      return new Response(
        JSON.stringify({ error: userFriendlyError }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const agentData = await agentResponse.json();
    console.log('Retell Agent created:', agentData.agent_id);

    const { data: userAgent, error: dbError } = await supabase
      .from('user_agents')
      .insert({
        user_id: user.id,
        template_id: templateId,
        retell_agent_id: agentData.agent_id,
        retell_llm_id: llmData.llm_id,
        phone_number_id: phoneNumber.id,
        name: finalAgentName,
        customizations: { agentName: finalAgentName, ...customConfig },
        settings: {
          voice_id: customConfig.voiceId || "11labs-Adrian",
          voice_speed: customConfig.voiceSpeed || 0.92,
          voice_temperature: customConfig.voiceTemperature || 1,
          volume: customConfig.volume || 1,
          responsiveness: customConfig.responsiveness || 0.8,
          interruption_sensitivity: customConfig.interruptionSensitivity || 0.8
        }
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database insert failed:', dbError);
      return new Response(
        JSON.stringify({ error: 'Failed to save agent data' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await supabase
      .from('phone_numbers')
      .update({ agent_id: userAgent.id })
      .eq('id', phoneNumber.id);

    console.log('Agent creation completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        agent: userAgent,
        message: 'AI agent created successfully!'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in create-agent-from-template function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
