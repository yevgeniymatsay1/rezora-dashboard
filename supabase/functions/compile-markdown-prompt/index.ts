/**
 * Edge Function: Compile Markdown Prompt
 *
 * Takes markdown-formatted prompt (with # sections) and compiles to Retell-compatible JSON.
 * Used by the frontend markdown source editor.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  compilePromptSections,
  validateCompiledPayload
} from "../_shared/prompt-compiler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { markdown } = await req.json();

    if (!markdown || typeof markdown !== "string") {
      return new Response(
        JSON.stringify({ error: "markdown parameter is required and must be a string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Compile markdown to Retell payload
    const compiled = compilePromptSections(markdown);

    // Validate the compiled payload
    const errors = validateCompiledPayload(compiled);

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({
          base_prompt: compiled.base_prompt || "",
          states: compiled.states || [],
          errors: errors
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Success
    return new Response(
      JSON.stringify({
        base_prompt: compiled.base_prompt,
        states: compiled.states,
        errors: []
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[compile-markdown-prompt] Error:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Unknown error during compilation",
        errors: [error.message || "Unknown error"]
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
