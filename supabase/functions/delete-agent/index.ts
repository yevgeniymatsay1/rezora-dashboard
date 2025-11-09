import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.0';
import { getRetellApiKeyForFunction } from '../_shared/retell-api-key.ts';
import { verifyAuth, verifyAgentAccess, auditLog, checkRateLimit } from '../_shared/authorization.ts';
import { validateRequest, deleteAgentSchema } from '../_shared/validation.ts';

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
    // Verify authentication
    const { user, error: authError } = await verifyAuth(req, true);
    if (authError) {
      return authError;
    }
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Check rate limiting
    if (checkRateLimit(user.id, 'delete-agent', 10, 60000)) { // 10 deletions per minute
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        { 
          status: 429, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate request body
    const { agentId, retellAgentId, retellLlmId } = await req.json();

    if (!agentId || !retellAgentId || !retellLlmId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const supabaseAuth = createClient(
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

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Authentication failed' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get user-specific or global Retell API key
    const retellApiKey = await getRetellApiKeyForFunction(user.id);
    if (!retellApiKey) {
      return new Response(
        JSON.stringify({ error: 'Retell API key not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the agent belongs to the authenticated user
    const { data: agent, error: agentError } = await supabase
      .from('user_agents')
      .select('id, user_id, phone_number_id')
      .eq('id', agentId)
      .eq('user_id', user.id)
      .single();

    if (agentError || !agent) {
      return new Response(
        JSON.stringify({ error: 'Agent not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Deleting agent from Retell AI:', { retellAgentId, retellLlmId });

    // Delete agent from Retell AI
    const deleteAgentResponse = await fetch(`https://api.retellai.com/delete-agent/${retellAgentId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!deleteAgentResponse.ok) {
      console.error('Failed to delete agent from Retell:', await deleteAgentResponse.text());
      throw new Error('Failed to delete agent from Retell AI');
    }

    // Delete LLM from Retell AI
    const deleteLlmResponse = await fetch(`https://api.retellai.com/delete-retell-llm/${retellLlmId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!deleteLlmResponse.ok) {
      console.error('Failed to delete LLM from Retell:', await deleteLlmResponse.text());
      throw new Error('Failed to delete LLM from Retell AI');
    }

    // Update phone number to remove agent association if there is one
    if (agent.phone_number_id) {
      const { error: phoneUpdateError } = await supabase
        .from('phone_numbers')
        .update({ agent_id: null })
        .eq('id', agent.phone_number_id);

      if (phoneUpdateError) {
        console.error('Error updating phone number:', phoneUpdateError);
      }
    }

    // Archive the agent in our database (soft delete)
    const { error: updateError } = await supabase
      .from('user_agents')
      .update({ 
        status: 'archived',
        is_active: false,
        retell_agent_id: null,
        retell_llm_id: null
      })
      .eq('id', agentId);

    if (updateError) {
      console.error('Error archiving agent:', updateError);
      throw new Error('Failed to archive agent in database');
    }

    console.log('Successfully deleted agent:', agentId);

    return new Response(
      JSON.stringify({ success: true, message: 'Agent deleted successfully' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in delete-agent function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});