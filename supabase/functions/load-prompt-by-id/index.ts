/**
 * Load Prompt By ID - Multi-ID Type Lookup
 *
 * This edge function allows loading prompts using various ID types:
 * - session_id: Direct session lookup
 * - prompt_version_id: Load specific prompt version
 * - test_agent_id: Load from test agent (sandbox)
 * - retell_agent_id: Load from Retell agent ID
 *
 * Returns session data in same format as generate_prompts_chat/get_session
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";
import { requireAdmin } from "../_shared/authorization.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const developerEmail = Deno.env.get("DEVELOPER_EMAIL") ?? "yevgeniymatsay@kw.com";

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

type LoadRequest = {
  id: string; // The ID to search for
  id_type?: "auto" | "session_id" | "prompt_version_id" | "test_agent_id" | "retell_agent_id";
};

type LoadResponse = {
  session_id: string;
  status: "conversation" | "ready_to_generate" | "generated";
  metadata?: Record<string, unknown>;
  conversation_history?: Array<{
    role: string;
    content: string;
    timestamp: string;
  }>;
  generated_prompts?: {
    base_prompt: string;
    states: unknown[];
  };
  prompt_version_id?: string;
  version_number?: number;
  progress_events?: Array<{
    phase: string;
    status: string;
    detail?: string;
    timestamp: string;
  }>;
  rag_contexts?: Record<string, string>;
  loaded_from?: string; // Indicates which ID type was used
};

/**
 * Detect ID type based on format and attempt lookup
 */
async function detectAndLoadSessionId(
  supabase: any,
  userId: string,
  id: string
): Promise<{ session_id: string | null; loaded_from: string }> {
  const trimmedId = id.trim();

  // Try session_id (UUID format)
  if (trimmedId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    // Check if it's a session_id
    const { data: session } = await supabase
      .from("prompt_generation_sessions")
      .select("id")
      .eq("id", trimmedId)
      .eq("user_id", userId)
      .maybeSingle();

    if (session) {
      return { session_id: session.id, loaded_from: "session_id" };
    }

    // Check if it's a prompt_version_id
    const { data: version } = await supabase
      .from("prompt_versions")
      .select("session_id, session:prompt_generation_sessions!inner(user_id)")
      .eq("id", trimmedId)
      .maybeSingle();

    if (version && version.session?.user_id === userId) {
      return { session_id: version.session_id, loaded_from: "prompt_version_id" };
    }

    // Check if it's a test_agent_id
    const { data: testAgent } = await supabase
      .from("test_agents")
      .select("prompt_version_id, prompt_versions!inner(session_id, session:prompt_generation_sessions!inner(user_id))")
      .eq("id", trimmedId)
      .eq("user_id", userId)
      .maybeSingle();

    if (testAgent && testAgent.prompt_versions?.session) {
      return { session_id: testAgent.prompt_versions.session_id, loaded_from: "test_agent_id" };
    }
  }

  // Try retell_agent_id (Retell format: agent_xxx or any non-UUID string)
  const { data: testAgent } = await supabase
    .from("test_agents")
    .select("prompt_version_id, prompt_versions!inner(session_id, session:prompt_generation_sessions!inner(user_id))")
    .eq("retell_agent_id", trimmedId)
    .eq("user_id", userId)
    .maybeSingle();

  if (testAgent && testAgent.prompt_versions?.session) {
    return { session_id: testAgent.prompt_versions.session_id, loaded_from: "retell_agent_id" };
  }

  return { session_id: null, loaded_from: "unknown" };
}

const handler = requireAdmin(async (req, user) => {
  // Additional check: only developer can access
  if (user.email?.toLowerCase() !== developerEmail.toLowerCase()) {
    return new Response(
      JSON.stringify({ error: "Unauthorized. This tool is for developer use only." }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { id, id_type = "auto" }: LoadRequest = await req.json();

  if (!id || !id.trim()) {
    return new Response(
      JSON.stringify({ error: "id is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let sessionId: string | null = null;
  let loadedFrom = "unknown";

  // If id_type is specified, try that specific type first
  if (id_type === "session_id") {
    const { data: session } = await supabase
      .from("prompt_generation_sessions")
      .select("id")
      .eq("id", id.trim())
      .eq("user_id", user.id)
      .maybeSingle();

    if (session) {
      sessionId = session.id;
      loadedFrom = "session_id";
    }
  } else if (id_type === "prompt_version_id") {
    const { data: version } = await supabase
      .from("prompt_versions")
      .select("session_id, session:prompt_generation_sessions!inner(user_id)")
      .eq("id", id.trim())
      .maybeSingle();

    if (version && version.session?.user_id === user.id) {
      sessionId = version.session_id;
      loadedFrom = "prompt_version_id";
    }
  } else if (id_type === "test_agent_id") {
    const { data: testAgent } = await supabase
      .from("test_agents")
      .select("prompt_version_id, prompt_versions!inner(session_id, session:prompt_generation_sessions!inner(user_id))")
      .eq("id", id.trim())
      .eq("user_id", user.id)
      .maybeSingle();

    if (testAgent && testAgent.prompt_versions?.session) {
      sessionId = testAgent.prompt_versions.session_id;
      loadedFrom = "test_agent_id";
    }
  } else if (id_type === "retell_agent_id") {
    const { data: testAgent } = await supabase
      .from("test_agents")
      .select("prompt_version_id, prompt_versions!inner(session_id, session:prompt_generation_sessions!inner(user_id))")
      .eq("retell_agent_id", id.trim())
      .eq("user_id", user.id)
      .maybeSingle();

    if (testAgent && testAgent.prompt_versions?.session) {
      sessionId = testAgent.prompt_versions.session_id;
      loadedFrom = "retell_agent_id";
    }
  } else {
    // Auto-detect
    const result = await detectAndLoadSessionId(supabase, user.id, id);
    sessionId = result.session_id;
    loadedFrom = result.loaded_from;
  }

  if (!sessionId) {
    return new Response(
      JSON.stringify({
        error: "Prompt not found",
        details: "No prompt found with the provided ID. Make sure you have access to this prompt.",
        tried_id_type: id_type
      }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Now load the full session data (same logic as get_session in generate_prompts_chat)
  const { data: session, error: fetchError } = await supabase
    .from("prompt_generation_sessions")
    .select("id, conversation_history, metadata, status, agent_type_name")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !session) {
    return new Response(
      JSON.stringify({ error: "Session not found or access denied" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Check if prompts were generated for this session
  const { data: promptVersions } = await supabase
    .from("prompt_versions")
    .select("id, version_number, base_prompt, states, generation_context, created_at")
    .eq("session_id", sessionId)
    .order("version_number", { ascending: false })
    .limit(1);

  const latestVersion = promptVersions && promptVersions.length > 0 ? promptVersions[0] : null;

  const sessionMetadata = session.metadata || {};

  const response: LoadResponse = {
    session_id: session.id,
    status: latestVersion ? "generated" : (session.status === "ready_to_generate" ? "ready_to_generate" : "conversation"),
    metadata: sessionMetadata,
    conversation_history: session.conversation_history || [],
    progress_events: sessionMetadata.progress_history || [],
    loaded_from: loadedFrom,
  };

  // Include generated prompts if they exist
  if (latestVersion) {
    response.generated_prompts = {
      base_prompt: latestVersion.base_prompt,
      states: latestVersion.states,
    };
    response.prompt_version_id = latestVersion.id;
    response.version_number = latestVersion.version_number;
    if (latestVersion.generation_context?.rag_contexts) {
      response.rag_contexts = latestVersion.generation_context.rag_contexts;
    }
    if (latestVersion.generation_context?.progress_events) {
      response.progress_events = latestVersion.generation_context.progress_events;
    }
  }

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    return await handler(req);
  } catch (error: any) {
    console.error("Error in load-prompt-by-id:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error",
        details: error.toString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
