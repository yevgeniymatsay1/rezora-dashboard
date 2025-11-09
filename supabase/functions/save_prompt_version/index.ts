/**
 * Edge Function: save_prompt_version
 *
 * Creates a new prompt_versions row using the service role.
 * Used by the admin markdown editor to persist manual edits.
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

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

type SaveVersionRequest = {
  session_id: string;
  base_prompt: string;
  states: unknown[];
  markdown_source?: string;
  changes_summary?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const handler = requireAdmin(async () => {
      const {
        session_id,
        base_prompt,
        states,
        markdown_source,
        changes_summary = "Manual edit via markdown source editor",
      }: SaveVersionRequest = await req.json();

      if (!session_id || !base_prompt || !Array.isArray(states)) {
        return new Response(
          JSON.stringify({ error: "session_id, base_prompt, and states are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // Fetch latest version number for the session
      const { data: latestVersion, error: latestError } = await supabase
        .from("prompt_versions")
        .select("version_number")
        .eq("session_id", session_id)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError) {
        console.error("Failed to fetch latest version:", latestError);
        return new Response(
          JSON.stringify({ error: "Failed to determine next version number" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const nextVersion = (latestVersion?.version_number ?? 0) + 1;

      const generationContext = {
        changes_summary,
        progress_events: null,
        rag_contexts: null,
      };

      const { data: inserted, error: insertError } = await supabase
        .from("prompt_versions")
        .insert({
          session_id,
          version_number: nextVersion,
          base_prompt,
          states,
          markdown_source,
          generation_context: generationContext,
        })
        .select("*")
        .single();

      if (insertError || !inserted) {
        console.error("Failed to insert prompt version:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to save prompt version" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ prompt_version: inserted }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    });

    return await handler(req);
  } catch (error) {
    console.error("[save_prompt_version] Unhandled error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
