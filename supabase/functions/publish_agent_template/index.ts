/**
 * Publish Agent Template - Finalize and Deploy New Agent Type
 *
 * This edge function:
 * 1. Loads finalized prompt version and placeholder suggestions
 * 2. Constructs agent_templates compatible structure
 * 3. Creates new template in agent_templates table
 * 4. Marks session as "finalized"
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

type PlaceholderFieldInput = {
  alias: string;
  config_path: string;
  label: string;
  helper_text?: string;
  component: "text" | "textarea" | "number" | "trait_selector";
  placeholder_text?: string;
  required?: boolean;
  default_value?: string;
};

type PlaceholderSectionInput = {
  id: string;
  title: string;
  subtitle?: string;
  fields: PlaceholderFieldInput[];
};

type PublishRequest = {
  prompt_version_id: string;
  placeholder_suggestions_id?: string | null;
  template_name: string;
  template_type: string; // e.g., "real-estate-wholesaler", "commercial-investor"
  is_active?: boolean;
  placeholder_sections: PlaceholderSectionInput[];
};

type PublishResponse = {
  agent_template_id: string;
  template_name: string;
  template_type: string;
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

  const {
    prompt_version_id,
    placeholder_suggestions_id = null,
    template_name,
    template_type,
    is_active = true,
    placeholder_sections = [],
  }: PublishRequest = await req.json();

  // Validate input
  if (!prompt_version_id || !template_name || !template_type) {
    return new Response(
      JSON.stringify({ error: "prompt_version_id, template_name, and template_type are required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!Array.isArray(placeholder_sections) || placeholder_sections.length === 0) {
    return new Response(
      JSON.stringify({ error: "placeholder_sections must be provided with at least one section." }),
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
      JSON.stringify({ error: "Unauthorized to publish this prompt version" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Load placeholder suggestions
  let suggestions: any = null;

  if (placeholder_suggestions_id) {
    const { data: fetchedSuggestions, error: suggestionsError } = await supabase
      .from("placeholder_suggestions")
      .select("*")
      .eq("id", placeholder_suggestions_id)
      .eq("prompt_version_id", prompt_version_id)
      .single();

    if (suggestionsError) {
      console.warn("Placeholder suggestions lookup failed, continuing with manual mapping:", suggestionsError);
    } else {
      suggestions = fetchedSuggestions;
    }
  }

  const normalizeAlias = (token: string) =>
    token.replace(/\{|\}/g, "").trim();

  const placeholderSuggestionMap = new Map<string, { semantic_key: string; default_value?: string }>();

  if (suggestions?.suggested_placeholders) {
    for (const suggestion of suggestions.suggested_placeholders as Array<{
      semantic_key: string;
      token: string;
      default_value?: string;
    }>) {
      placeholderSuggestionMap.set(normalizeAlias(suggestion.token || ""), {
        semantic_key: suggestion.semantic_key,
        default_value: suggestion.default_value,
      });
    }
  }

  const sectionMeta: Record<string, { title: string; subtitle?: string; order: number }> = {};
  const placeholderMap: Array<Record<string, unknown>> = [];
  const defaultsAccumulator: Record<string, any> = {};

  function setByPath(target: Record<string, any>, path: string, value: any) {
    if (!path) return;
    const parts = path.split(".");
    let current = target;
    for (let i = 0; i < parts.length; i++) {
      const key = parts[i];
      if (i === parts.length - 1) {
        current[key] = value;
      } else {
        current[key] = current[key] ?? {};
        current = current[key];
      }
    }
  }

  try {
    placeholder_sections.forEach((section, sectionIndex) => {
    if (!section?.id || !section?.title || !Array.isArray(section.fields)) {
      throw new Error(`Section id and title are required (${JSON.stringify(section)})`);
    }

      sectionMeta[section.id] = {
        title: section.title,
        subtitle: section.subtitle ?? "",
        order: sectionIndex,
      };

      section.fields.forEach((field, fieldIndex) => {
        const alias = normalizeAlias(field.alias);
        if (!alias) {
          throw new Error(`Invalid placeholder alias provided in section ${section.id}`);
        }
        if (!field.config_path) {
          throw new Error(`config_path is required for alias ${field.alias}`);
        }
        if (!field.component) {
          throw new Error(`component is required for alias ${field.alias}`);
        }
        if (!field.label) {
          throw new Error(`label is required for alias ${field.alias}`);
        }

        const suggestion = placeholderSuggestionMap.get(alias);
        const canonicalKey = suggestion?.semantic_key ?? alias.replace(/\s+/g, "_").toLowerCase();

        const defaultValue = field.default_value ?? suggestion?.default_value ?? "";

        setByPath(defaultsAccumulator, field.config_path, defaultValue);

        placeholderMap.push({
          canonical_key: canonicalKey,
          alias,
          scope: "config_time",
          ui_group: section.id,
          source_path: field.config_path,
          frontend_label: field.label,
          required: Boolean(field.required),
          default_value: defaultValue,
          validation: null,
          ui: {
            section_id: section.id,
            helper_text: field.helper_text ?? "",
            component: field.component,
            placeholder_text: field.placeholder_text ?? "",
            order: fieldIndex,
          },
        });
      });
    });
  } catch (error) {
    console.error("Placeholder mapping error:", error);
    return new Response(
      JSON.stringify({ error: `Invalid placeholder mapping: ${error instanceof Error ? error.message : String(error)}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const conversationFlowDefaults = defaultsAccumulator.conversationFlow ?? {};

  console.log("Publishing agent template:", template_name);

  const defaultSettings = {
    starting_state: "warm_intro",
    states: promptVersion.states,
    conversationFlow: conversationFlowDefaults,
    placeholderMap,
    placeholderSections: sectionMeta,
    defaults: defaultsAccumulator,
    voice_id: "11labs-Adrian",
    voice_model: "eleven_turbo_v2_5",
    voice_temperature: 1,
    voice_speed: 0.92,
    responsiveness: 0.8,
    interruption_sensitivity: 0.8,
  };

  if (!Array.isArray(defaultSettings.placeholderMap) || defaultSettings.placeholderMap.length === 0) {
    return new Response(
      JSON.stringify({ error: "No placeholder mapping was provided. Please assign placeholders to sections before publishing." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Create agent template
  const { data: newTemplate, error: templateError } = await supabase
    .from("agent_templates")
    .insert({
      name: template_name,
      template_type: template_type,
      base_prompt: promptVersion.base_prompt,
      default_settings: defaultSettings,
      is_active,
    })
    .select("id, name, template_type")
    .single();

  if (templateError || !newTemplate) {
    console.error("Failed to create agent template:", templateError);
    return new Response(
      JSON.stringify({ error: "Failed to create agent template", details: templateError?.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log(`Agent template created: ${newTemplate.id}`);

  // Mark session as finalized
  await supabase
    .from("prompt_generation_sessions")
    .update({
      status: "finalized",
      updated_at: new Date().toISOString(),
    })
    .eq("id", promptVersion.session_id);

  // Mark placeholder suggestions as approved
  if (placeholder_suggestions_id) {
    await supabase
      .from("placeholder_suggestions")
      .update({
        user_approved: true,
      })
      .eq("id", placeholder_suggestions_id);
  }

  const response: PublishResponse = {
    agent_template_id: newTemplate.id,
    template_name: newTemplate.name,
    template_type: newTemplate.template_type,
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
