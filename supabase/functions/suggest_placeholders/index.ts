/**
 * Suggest Placeholders - Auto-Generate User Customization Options
 *
 * This edge function:
 * 1. Analyzes finalized prompt version
 * 2. Uses Placeholder Analyzer LLM to suggest customizable fields
 * 3. Identifies conversation flow editable guidelines
 * 4. Stores suggestions for user approval
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";
import { requireAdmin } from "../_shared/authorization.ts";
import { suggestPlaceholders } from "../_shared/llm-helpers.ts";

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

type SuggestRequest = {
  prompt_version_id: string;
  force_reanalyze?: boolean;
};

type SuggestResponse = {
  placeholder_suggestions_id: string;
  suggested_placeholders: unknown[];
  suggested_editable_guidelines: unknown[];
  total_count: number;
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

  const { prompt_version_id, force_reanalyze = false }: SuggestRequest = await req.json();

  // Validate input
  if (!prompt_version_id) {
    return new Response(
      JSON.stringify({ error: "prompt_version_id is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Load prompt version
  const { data: promptVersion, error: versionError } = await supabase
    .from("prompt_versions")
    .select(`
      id,
      session_id,
      base_prompt,
      states,
      prompt_generation_sessions!inner(
        user_id
      )
    `)
    .eq("id", prompt_version_id)
    .single();

  if (versionError || !promptVersion) {
    console.error("Prompt version not found:", versionError);
    return new Response(
      JSON.stringify({ error: "Prompt version not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // @ts-ignore - Type inference issue
  if (promptVersion.prompt_generation_sessions.user_id !== user.id) {
    return new Response(
      JSON.stringify({ error: "Unauthorized to analyze this prompt version" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Check if suggestions already exist
  const { data: existingSuggestions } = await supabase
    .from("placeholder_suggestions")
    .select("id")
    .eq("prompt_version_id", prompt_version_id)
    .single();

  if (existingSuggestions) {
    if (!force_reanalyze) {
      const response: SuggestResponse = {
        placeholder_suggestions_id: existingSuggestions.id,
        suggested_placeholders: existingSuggestions.suggested_placeholders ?? [],
        suggested_editable_guidelines: existingSuggestions.suggested_editable_guidelines ?? [],
        total_count:
          (existingSuggestions.suggested_placeholders?.length ?? 0) +
          (existingSuggestions.suggested_editable_guidelines?.length ?? 0),
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: deleteError } = await supabase
      .from("placeholder_suggestions")
      .delete()
      .eq("id", existingSuggestions.id);

    if (deleteError) {
      console.error("Failed to delete existing placeholder suggestions before re-analyzing:", deleteError);
      return new Response(
        JSON.stringify({ error: "Failed to reset existing placeholder suggestions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  console.log("Analyzing prompts for placeholder suggestions...");

  // Generate suggestions using Placeholder Analyzer LLM
  let suggestions;

  try {
    suggestions = await suggestPlaceholders(
      promptVersion.base_prompt,
      promptVersion.states,
      user.id
    );
  } catch (error) {
    console.error("Failed to generate placeholder suggestions:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate suggestions", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log(`Generated ${suggestions.suggested_placeholders.length} placeholder suggestions`);
  console.log(`Generated ${suggestions.suggested_editable_guidelines.length} editable guideline suggestions`);

  // Store suggestions
  const { data: stored, error: storeError } = await supabase
    .from("placeholder_suggestions")
    .insert({
      prompt_version_id,
      suggested_placeholders: suggestions.suggested_placeholders,
      suggested_editable_guidelines: suggestions.suggested_editable_guidelines,
      user_approved: false,
    })
    .select("id")
    .single();

  if (storeError || !stored) {
    console.error("Failed to store suggestions:", storeError);
    return new Response(
      JSON.stringify({ error: "Failed to store suggestions" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const response: SuggestResponse = {
    placeholder_suggestions_id: stored.id,
    suggested_placeholders: suggestions.suggested_placeholders,
    suggested_editable_guidelines: suggestions.suggested_editable_guidelines,
    total_count:
      suggestions.suggested_placeholders.length +
      suggestions.suggested_editable_guidelines.length,
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return handler(req);
});
