/**
 * Edge Function: Update Prompt Factory Settings
 *
 * Creates or updates LLM configuration settings for Prompt Factory
 * Tracks changes in history table for auditing and rollback
 *
 * Auth: Requires authenticated user (can update own settings) or admin (can update any)
 * Method: POST
 * Body: Partial settings object (only fields to update)
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
}

interface UpdateSettingsRequest {
  user_id?: string; // Optional, admin can update other users
  generator_temperature?: number;
  generator_system_prompt?: string | null;
  question_generator_temperature?: number;
  refinement_temperature?: number;
  script_analyzer_temperature?: number;
}

interface PromptFactorySettings {
  id: string;
  user_id: string;
  generator_temperature: number;
  generator_system_prompt: string | null;
  question_generator_temperature: number;
  refinement_temperature: number;
  script_analyzer_temperature: number;
  created_at: string;
  updated_at: string;
}

function validateTemperature(value: any, fieldName: string): void {
  if (typeof value !== "number") {
    throw new Error(`${fieldName} must be a number`);
  }
  if (value < 0 || value > 1) {
    throw new Error(`${fieldName} must be between 0 and 1`);
  }
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

    // Parse request body
    const requestData: UpdateSettingsRequest = await req.json();

    // Determine target user
    const targetUserId = requestData.user_id || user.id;

    // Check permissions if updating another user's settings
    if (targetUserId !== user.id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || profile.role !== "admin") {
        return new Response(
          JSON.stringify({ error: "Insufficient permissions. Only admins can update other users' settings." }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Validate temperatures if provided
    if (requestData.generator_temperature !== undefined) {
      validateTemperature(requestData.generator_temperature, "generator_temperature");
    }
    if (requestData.question_generator_temperature !== undefined) {
      validateTemperature(requestData.question_generator_temperature, "question_generator_temperature");
    }
    if (requestData.refinement_temperature !== undefined) {
      validateTemperature(requestData.refinement_temperature, "refinement_temperature");
    }
    if (requestData.script_analyzer_temperature !== undefined) {
      validateTemperature(requestData.script_analyzer_temperature, "script_analyzer_temperature");
    }

    // Build update object (only include provided fields)
    const updateData: any = {
      user_id: targetUserId,
    };

    if (requestData.generator_temperature !== undefined) {
      updateData.generator_temperature = requestData.generator_temperature;
    }
    if (requestData.generator_system_prompt !== undefined) {
      updateData.generator_system_prompt = requestData.generator_system_prompt;
    }
    if (requestData.question_generator_temperature !== undefined) {
      updateData.question_generator_temperature = requestData.question_generator_temperature;
    }
    if (requestData.refinement_temperature !== undefined) {
      updateData.refinement_temperature = requestData.refinement_temperature;
    }
    if (requestData.script_analyzer_temperature !== undefined) {
      updateData.script_analyzer_temperature = requestData.script_analyzer_temperature;
    }

    // Upsert settings (insert or update)
    const { data: settings, error: upsertError } = await supabase
      .from("prompt_factory_settings")
      .upsert(updateData, { onConflict: "user_id" })
      .select()
      .single();

    if (upsertError) {
      console.error("[update-prompt-factory-settings] Upsert error:", upsertError);
      return new Response(
        JSON.stringify({ error: "Failed to update settings", details: upsertError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Return updated settings
    return new Response(
      JSON.stringify({
        success: true,
        settings: settings as PromptFactorySettings,
        message: "Settings updated successfully",
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("[update-prompt-factory-settings] Error:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to update settings",
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
