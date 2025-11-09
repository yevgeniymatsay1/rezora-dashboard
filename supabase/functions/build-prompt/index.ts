import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STANDARD_VARIABLES = [
  // Contact Information
  { key: 'first_name', label: 'First Name', category: 'Contact Information', required: true },
  { key: 'last_name', label: 'Last Name', category: 'Contact Information', required: true },
  { key: 'phone_number', label: 'Phone Number', category: 'Contact Information', required: true },
  { key: 'email', label: 'Email', category: 'Contact Information' },
  { key: 'company', label: 'Company', category: 'Contact Information' },
  
  // Property Details
  { key: 'property_address', label: 'Property Address', category: 'Property Details' },
  { key: 'city', label: 'City', category: 'Property Details' },
  { key: 'state', label: 'State', category: 'Property Details' },
  { key: 'zip_code', label: 'Zip Code', category: 'Property Details' },
  { key: 'listing_price', label: 'Listing Price', category: 'Property Details' },
  { key: 'property_type', label: 'Property Type', category: 'Property Details' },
  { key: 'bedrooms', label: 'Bedrooms', category: 'Property Details' },
  { key: 'bathrooms', label: 'Bathrooms', category: 'Property Details' },
  { key: 'square_feet', label: 'Square Feet', category: 'Property Details' },
  
  // Lead Information
  { key: 'lead_source', label: 'Lead Source', category: 'Lead Information' },
  { key: 'lead_type', label: 'Lead Type', category: 'Lead Information' },
  { key: 'interest_level', label: 'Interest Level', category: 'Lead Information' },
  { key: 'last_contact_date', label: 'Last Contact Date', category: 'Lead Information' },
  { key: 'previous_agent', label: 'Previous Agent', category: 'Lead Information' },
  
  // Custom Fields
  { key: 'custom_1', label: 'Custom Field 1', category: 'Custom Fields' },
  { key: 'custom_2', label: 'Custom Field 2', category: 'Custom Fields' },
  { key: 'custom_3', label: 'Custom Field 3', category: 'Custom Fields' },
  { key: 'custom_4', label: 'Custom Field 4', category: 'Custom Fields' },
  { key: 'custom_5', label: 'Custom Field 5', category: 'Custom Fields' }
];

function generateCacheKey(agentId: string, selectedFields: string[], fieldMappings: Record<string, string>): string {
  const fieldsKey = selectedFields.sort().join(',');
  const mappingsKey = JSON.stringify(fieldMappings);
  return `${agentId}-${fieldsKey}-${mappingsKey}`;
}

function buildDynamicBackground(selectedFields: string[], fieldMappings: Record<string, string>): string {
  if (!selectedFields || selectedFields.length === 0) {
    return "## Background about User\n- No specific contact information selected";
  }

  // Build a simple flat list of variables
  const validFields: Array<{key: string, label: string}> = [];
  
  selectedFields.forEach(fieldKey => {
    const variable = STANDARD_VARIABLES.find(v => v.key === fieldKey);
    if (variable) {
      validFields.push({
        key: fieldKey,
        label: variable.label
      });
    }
  });

  if (validFields.length === 0) {
    return "## Background about User\n- No valid contact information selected";
  }

  let backgroundSection = "## Background about User\n";
  
  // Add each field as a simple list item
  for (const field of validFields) {
    backgroundSection += `- ${field.label}: {{${field.key}}}\n`;
  }

  return backgroundSection;
}

serve(async (req) => {
  // Handle CORS preflight requests
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

    const { agentId, selectedFields, fieldMappings } = await req.json();

    if (!agentId) {
      throw new Error('Agent ID is required');
    }

    // Generate cache key
    const cacheKey = generateCacheKey(agentId, selectedFields || [], fieldMappings || {});

    // Fetch agent data
    const { data: agent, error: agentError } = await supabase
      .from('user_agents')
      .select('*, agent_templates!inner(*)')
      .eq('id', agentId)
      .eq('user_id', user.id)
      .single();

    if (agentError || !agent) {
      throw new Error('Agent not found or access denied');
    }

    let fullPrompt: string;
    let wasFromCache = false;

    // Check if we have a cached prompt that's still valid
    if (agent.prompt_cache_key === cacheKey && agent.dynamic_prompt) {
      console.log('Using cached prompt for agent:', agentId);
      fullPrompt = agent.dynamic_prompt;
      wasFromCache = true;
    } else {
      console.log('Building new prompt for agent:', agentId);
      
      // Build new dynamic prompt using user's configured prompt (preserves customizations)
      // Always use configured_prompt which now has the placeholder intact
      const userConfiguredPrompt = agent.configured_prompt;
      
      if (!userConfiguredPrompt) {
        throw new Error('Agent configured_prompt is missing. Please reconfigure the agent.');
      }
      
      const dynamicBackground = buildDynamicBackground(selectedFields || [], fieldMappings || {});
      
      // Replace {USER_BACKGROUND_SECTION} placeholder with dynamic background
      fullPrompt = userConfiguredPrompt.replace('{USER_BACKGROUND_SECTION}', dynamicBackground);

      // Update cache in database
      const { error: updateError } = await supabase
        .from('user_agents')
        .update({
          dynamic_prompt: fullPrompt,
          prompt_cache_key: cacheKey,
          prompt_updated_at: new Date().toISOString()
        })
        .eq('id', agentId);

      if (updateError) {
        console.error('Failed to update prompt cache:', updateError);
        // Continue anyway, just don't cache
      }

      console.log('Built and cached new prompt for agent:', agentId);
    }

    // Update Retell LLM with the new dynamic prompt and preserve tools
    let llmUpdateSuccess = false;
    let llmUpdateError = null;

    if (agent.retell_llm_id) {
      try {
        console.log('Updating Retell LLM via update-retell-llm function');
        
        // Get agent's integrations from customizations or settings
        // Only pass integrations if they exist to avoid overwriting existing tools
        const integrations = agent.customizations?.integrations || agent.settings?.integrations;
        
        console.log('Build-prompt: Found integrations:', {
          hasIntegrations: !!integrations,
          calComEnabled: integrations?.enableCalCom || integrations?.enableCalIntegration,
          calComApiKey: integrations?.calComApiKey ? 'present' : 'missing'
        });
        
        // Build request body - only include integrations if they exist
        const requestBody: any = {
          agentId: agent.id,
          dynamicPrompt: fullPrompt
        };
        
        // Only add integrations if they exist to avoid clearing tools
        if (integrations) {
          requestBody.integrations = integrations;
        }
        
        const { data: llmUpdateData, error: updateError } = await supabase.functions.invoke('update-retell-llm', {
          body: requestBody
        });

        if (updateError) {
          console.error('Failed to update Retell LLM via function:', updateError);
          llmUpdateError = updateError.message || 'Failed to update LLM';
        } else if (llmUpdateData?.success) {
          llmUpdateSuccess = true;
          console.log('LLM update successful via function');
        } else {
          llmUpdateError = llmUpdateData?.error || 'Unknown error updating LLM';
          console.error('LLM update failed:', llmUpdateError);
        }
      } catch (error) {
        llmUpdateError = `Error calling update-retell-llm function: ${error.message}`;
        console.error('Error calling update-retell-llm function:', error);
      }
    } else {
      llmUpdateError = 'Agent does not have a Retell LLM ID';
      console.warn('Agent does not have a Retell LLM ID, skipping LLM update');
    }

    return new Response(
      JSON.stringify({
        prompt: fullPrompt,
        cached: wasFromCache,
        cacheKey,
        llm_updated: llmUpdateSuccess,
        llm_error: llmUpdateError
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in build-prompt function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: 'Failed to build dynamic prompt'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});