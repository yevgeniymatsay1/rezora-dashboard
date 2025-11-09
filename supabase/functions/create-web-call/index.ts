
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getRetellApiKeyForFunction } from '../_shared/retell-api-key.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { agent_id } = await req.json();
    
    if (!agent_id) {
      throw new Error('Agent ID is required');
    }

    // Get authenticated user first
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header provided');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader }
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

    // Get user-specific or global Retell API key
    const retellApiKey = await getRetellApiKeyForFunction(user.id);
    if (!retellApiKey) {
      throw new Error('Retell API key not configured');
    }

    // Initialize service role client for database operations
    const supabaseService = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    console.log('Creating web call for database agent ID:', agent_id);

    // Get the retell_agent_id from the database (ensure it belongs to the user)
    const { data: agentData, error: agentError } = await supabaseService
      .from('user_agents')
      .select('retell_agent_id, id, user_id')
      .eq('id', agent_id)
      .eq('user_id', user.id)
      .single();

    if (agentError || !agentData) {
      console.error('Failed to find agent:', agentError);
      throw new Error('Agent not found');
    }

    if (!agentData.retell_agent_id) {
      throw new Error('Agent does not have a Retell agent ID');
    }

    // Create a web call session row first for attribution and later billing
    const { data: session, error: sessionError } = await supabaseService
      .from('web_call_sessions')
      .insert({
        user_id: user.id,
        agent_id: agent_id,
        status: 'initiated',
        metadata: {
          source: 'web_call',
          created_via: 'create-web-call',
          created_by_user_id: user.id
        }
      })
      .select('id')
      .single();

    if (sessionError || !session) {
      console.error('Failed to create web call session:', sessionError);
      throw new Error('Failed to initialize web call session');
    }

    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/retell-webhook`;
    console.log('Using Retell agent ID:', agentData.retell_agent_id);
    console.log('Webhook URL for Retell:', webhookUrl);
    console.log('Web call session ID:', session.id);

    // Create web call using Retell API with webhook and metadata for attribution
    const response = await fetch('https://api.retellai.com/v2/create-web-call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: agentData.retell_agent_id,
        webhook_url: webhookUrl,
        metadata: {
          source: 'web_call',
          web_call_session_id: session.id,
          user_id: user.id,
          agent_id: agent_id
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Retell API error:', response.status, errorText);
      // Update session to failed
      await supabaseService
        .from('web_call_sessions')
        .update({ status: 'failed' })
        .eq('id', session.id);
      throw new Error(`Retell API error: ${response.status} ${errorText}`);
    }

    const webCallData = await response.json();
    console.log('Web call created successfully:', webCallData);

    // Persist retell_call_id on the session if available
    const retellCallId = webCallData?.call_id || webCallData?.id || null;
    if (retellCallId) {
      await supabaseService
        .from('web_call_sessions')
        .update({ retell_call_id: retellCallId })
        .eq('id', session.id);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      data: { 
        ...webCallData, 
        web_call_session_id: session.id 
      } 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error creating web call:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
