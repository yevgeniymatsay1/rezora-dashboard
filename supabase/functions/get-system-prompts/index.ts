/**
 * Edge Function: Get System Prompts
 *
 * Returns actual LLM system prompts used by Prompt Factory
 * Used by AdminPromptGenerator frontend to display current backend prompts
 *
 * This is a read-only, public endpoint (no auth required)
 * Returns prompt templates with placeholder markers (not filled values)
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";
import {
  getGeneratorQuestionPrompt,
  getGeneratorMarkdownPrompt,
  getCriticPrompt,
  getPatternExtractorPrompt,
  getPlaceholderAnalyzerPrompt,
  getRefinementPrompt
} from "../_shared/llm-prompts-export.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Default settings
const DEFAULT_SETTINGS = {
  generator_temperature: 0.2,
  question_generator_temperature: 0.2,
  refinement_temperature: 0.1,
  script_analyzer_temperature: 0.2,
};

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const timestamp = new Date().toISOString();

    // Try to get user settings (with auth)
    let settings = DEFAULT_SETTINGS;
    const authHeader = req.headers.get("Authorization");

    if (authHeader && supabaseUrl && supabaseAnonKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          global: {
            headers: { Authorization: authHeader },
          },
        });

        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          const { data: userSettings } = await supabase
            .from("prompt_factory_settings")
            .select("generator_temperature, question_generator_temperature, refinement_temperature, script_analyzer_temperature")
            .eq("user_id", user.id)
            .maybeSingle();

          if (userSettings) {
            settings = {
              generator_temperature: userSettings.generator_temperature ?? DEFAULT_SETTINGS.generator_temperature,
              question_generator_temperature: userSettings.question_generator_temperature ?? DEFAULT_SETTINGS.question_generator_temperature,
              refinement_temperature: userSettings.refinement_temperature ?? DEFAULT_SETTINGS.refinement_temperature,
              script_analyzer_temperature: userSettings.script_analyzer_temperature ?? DEFAULT_SETTINGS.script_analyzer_temperature,
            };
          }
        }
      } catch (error) {
        console.warn("[get-system-prompts] Failed to fetch user settings, using defaults:", error);
        // Continue with defaults
      }
    }

    const response = {
      prompts: {
        generator_question: {
          name: "Generator LLM - Next Question Prompt",
          description: "Generates targeted follow-up questions during metadata extraction",
          model: "Claude Sonnet 4.5",
          temperature: settings.question_generator_temperature,
          max_tokens: 2048,
          template: getGeneratorQuestionPrompt()
        },
        generator_markdown: {
          name: "Generator LLM - Agent Prompt Generation (ENHANCED)",
          description: "Produces flow-based markdown prompts with quality principles",
          model: "Claude Sonnet 4.5",
          temperature: settings.generator_temperature,
          max_tokens: 8192,
          template: getGeneratorMarkdownPrompt()
        },
        critic: {
          name: "Critic LLM - Transcript Analysis",
          description: "Analyzes call performance including prompt structure issues",
          model: "Claude Sonnet 4.5",
          temperature: 0.2, // Critic always uses 0.2 (not configurable)
          max_tokens: 4096,
          template: getCriticPrompt()
        },
        pattern_extractor: {
          name: "Pattern Extractor LLM - RAG Learning",
          description: "Extracts reusable patterns for Knowledge Base",
          model: "Claude Sonnet 4.5",
          temperature: 0.2, // Pattern extractor always uses 0.2 (not configurable)
          max_tokens: 2048,
          template: getPatternExtractorPrompt()
        },
        placeholder_analyzer: {
          name: "Placeholder Analyzer LLM",
          description: "Identifies user-customizable fields in generated prompts",
          model: "Claude Sonnet 4.5",
          temperature: 0.1, // Placeholder analyzer always uses 0.1 (not configurable)
          max_tokens: 2048,
          template: getPlaceholderAnalyzerPrompt()
        },
        refinement: {
          name: "Refinement LLM - Iterative Improvement",
          description: "Improves prompts based on feedback with emphasis on simplification",
          model: "Claude Sonnet 4.5",
          temperature: settings.refinement_temperature,
          max_tokens: 4096,
          template: getRefinementPrompt()
        },
        script_analyzer: {
          name: "Script Analyzer LLM - Conversational Flow Analysis",
          description: "Analyzes example scripts to understand style and structure patterns (NOT content to copy)",
          model: "Claude Sonnet 4.5",
          temperature: settings.script_analyzer_temperature,
          max_tokens: 2048,
          template: "See analyzeConversationalFlow() in llm-helpers.ts"
        }
      },
      metadata: {
        last_updated: timestamp,
        source: "llm-prompts-export.ts",
        version: "2.0",
        settings_source: authHeader ? "user_settings_or_defaults" : "defaults_only"
      }
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error: any) {
    console.error("[get-system-prompts] Error:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to retrieve system prompts"
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    );
  }
});
