/**
 * Edge Function: Get Prompt Factory Settings
 *
 * Retrieves LLM configuration settings for Prompt Factory
 * Returns user-specific settings or defaults if not configured
 *
 * Auth: Requires authenticated user
 * Returns: Settings with defaults for any unconfigured values
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
}

// Default settings (fallback if not configured)
const DEFAULT_SETTINGS = {
  generator_temperature: 0.2,
  generator_system_prompt: null, // null = use hardcoded prompt in llm-helpers.ts
  question_generator_temperature: 0.2,
  refinement_temperature: 0.1,
  script_analyzer_temperature: 0.2,
};

interface PromptFactorySettings {
  id?: string;
  user_id: string;
  generator_temperature: number;
  generator_system_prompt: string | null;
  question_generator_temperature: number;
  refinement_temperature: number;
  script_analyzer_temperature: number;
  created_at?: string;
  updated_at?: string;
}

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get("Authorization");

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Query optional user_id parameter (for admin viewing other users' settings)
    const url = new URL(req.url);
    const targetUserId = url.searchParams.get("user_id") || user.id;

    // Check if user is admin if requesting another user's settings
    if (targetUserId !== user.id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || profile.role !== "admin") {
        return new Response(
          JSON.stringify({ error: "Insufficient permissions. Only admins can view other users' settings." }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Fetch settings from database
    const { data: settings, error: fetchError } = await supabase
      .from("prompt_factory_settings")
      .select("*")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (fetchError) {
      console.error("[get-prompt-factory-settings] Database error:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch settings", details: fetchError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Return settings or defaults
    const response: PromptFactorySettings = settings || {
      user_id: targetUserId,
      ...DEFAULT_SETTINGS,
    };

    // Ensure all fields have values (merge with defaults)
    const finalResponse = {
      ...DEFAULT_SETTINGS,
      ...response,
    };

    return new Response(JSON.stringify(finalResponse), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error: any) {
    console.error("[get-prompt-factory-settings] Error:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to retrieve settings",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
