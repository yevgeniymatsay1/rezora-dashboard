/**
 * List User Sessions - Get Recent Prompt Factory Sessions
 *
 * Returns a list of recent prompt generation sessions for the current user,
 * including metadata about prompts, versions, and test agents.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";
import { requireAdmin } from "../_shared/authorization.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const developerEmail = Deno.env.get("DEVELOPER_EMAIL") ?? "yevgeniymatsay@kw.com";

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

type SessionSummary = {
  session_id: string;
  agent_type_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  version_count: number;
  latest_version_number?: number;
  has_test_agent: boolean;
  test_agent_id?: string;
  retell_agent_id?: string;
};

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

  // Get limit from query params (default 20, max 50)
  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(parseInt(limitParam || "20", 10), 50);

  // Get all sessions for user
  const { data: sessions, error: sessionsError } = await supabase
    .from("prompt_generation_sessions")
    .select("id, agent_type_name, status, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (sessionsError) {
    console.error("Failed to fetch sessions:", sessionsError);
    return new Response(
      JSON.stringify({ error: "Failed to fetch sessions" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!sessions || sessions.length === 0) {
    return new Response(
      JSON.stringify({ sessions: [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Get prompt version counts for each session
  const sessionIds = sessions.map(s => s.id);
  const { data: versions } = await supabase
    .from("prompt_versions")
    .select("session_id, version_number")
    .in("session_id", sessionIds);

  // Get test agent info for each session (via prompt_versions)
  const { data: testAgents } = await supabase
    .from("test_agents")
    .select("id, retell_agent_id, prompt_version_id, prompt_versions!inner(session_id)")
    .eq("user_id", user.id)
    .in("prompt_versions.session_id", sessionIds)
    .is("deleted_at", null);

  // Build session summaries
  const sessionSummaries: SessionSummary[] = sessions.map(session => {
    // Count versions for this session
    const sessionVersions = versions?.filter(v => v.session_id === session.id) || [];
    const versionCount = sessionVersions.length;
    const latestVersionNumber = sessionVersions.length > 0
      ? Math.max(...sessionVersions.map(v => v.version_number))
      : undefined;

    // Find test agent for this session
    const testAgent = testAgents?.find((ta: any) => ta.prompt_versions?.session_id === session.id);

    return {
      session_id: session.id,
      agent_type_name: session.agent_type_name,
      status: session.status,
      created_at: session.created_at,
      updated_at: session.updated_at,
      version_count: versionCount,
      latest_version_number: latestVersionNumber,
      has_test_agent: !!testAgent,
      test_agent_id: testAgent?.id,
      retell_agent_id: testAgent?.retell_agent_id,
    };
  });

  return new Response(
    JSON.stringify({
      sessions: sessionSummaries,
      count: sessionSummaries.length,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    return await handler(req);
  } catch (error: any) {
    console.error("Error in list-user-sessions:", error);
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
