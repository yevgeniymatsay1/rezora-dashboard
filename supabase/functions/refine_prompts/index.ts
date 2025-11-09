/**
 * Refine Prompts - Iterative Improvement Based on Feedback
 *
 * This edge function:
 * 1. Loads previous prompt version
 * 2. Loads evaluation feedback
 * 3. Retrieves relevant improvement patterns from RAG
 * 4. Generates improved version using LLM
 * 5. Stores as new version (increments version_number)
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";
import { requireAdmin } from "../_shared/authorization.ts";
import {
  refinePromptsWithFeedback,
  type TranscriptAnalysis,
} from "../_shared/llm-helpers.ts";
import {
  retrieveKnowledgeBaseContext,
  formatRAGContext,
  buildRefinementQuery,
  isKnowledgeBaseAvailable,
} from "../_shared/bedrock-rag.ts";

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

type RefineRequest = {
  prompt_version_id?: string;
  evaluation_id?: string;
  session_id?: string; // NEW: For session-scoped refinement
  quality_feedback?: { // NEW: For quality-based refinement
    previous_score: number;
    issues_to_fix: string[];
    suggestions: string[];
  };
};

type RefineResponse = {
  new_version_id: string;
  version_number: number;
  changes_summary: string;
  base_prompt: string;
  states: unknown[];
  rag_context_used: boolean;
  quality_score?: number; // NEW
  quality_regressed?: boolean; // NEW
  original_version?: { // NEW: For comparison
    id: string;
    quality_score?: number;
  };
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

  const { prompt_version_id, evaluation_id, session_id, quality_feedback }: RefineRequest = await req.json();

  // Validate input - require either (prompt_version_id + evaluation_id) OR session_id
  if (!prompt_version_id && !session_id) {
    return new Response(
      JSON.stringify({ error: "Either (prompt_version_id + evaluation_id) or session_id is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (prompt_version_id && !evaluation_id && !quality_feedback) {
    return new Response(
      JSON.stringify({ error: "Either evaluation_id or quality_feedback is required when prompt_version_id is provided" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Determine which version to refine
  let versionIdToRefine = prompt_version_id;

  if (session_id) {
    // Load latest version for this session
    const { data: latestSessionVersion, error: latestError } = await supabase
      .from("prompt_versions")
      .select("id")
      .eq("session_id", session_id)
      .order("version_number", { ascending: false })
      .limit(1)
      .single();

    if (latestError || !latestSessionVersion) {
      console.error("Latest version not found for session:", latestError);
      return new Response(
        JSON.stringify({ error: "No prompt versions found for this session" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    versionIdToRefine = latestSessionVersion.id;
    console.log(`Session-scoped refinement: using latest version ${versionIdToRefine}`);
  }

  // Load prompt version
  const { data: promptVersion, error: versionError } = await supabase
    .from("prompt_versions")
    .select(`
      id,
      session_id,
      version_number,
      base_prompt,
      states,
      generation_context,
      markdown_source,
      prompt_generation_sessions!inner(
        user_id,
        agent_type_name,
        metadata
      )
    `)
    .eq("id", versionIdToRefine)
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
      JSON.stringify({ error: "Unauthorized to refine this prompt version" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Track original quality score
  const originalQualityScore = promptVersion.generation_context?.quality_validation?.score ?? null;

  // Load evaluation (optional - only if evaluation_id provided)
  let evaluation: any = null;
  let analysis: TranscriptAnalysis | null = null;
  const issues: string[] = [];

  if (evaluation_id) {
    const { data: evalData, error: evalError } = await supabase
      .from("prompt_evaluations")
      .select("*")
      .eq("id", evaluation_id)
      .eq("prompt_version_id", versionIdToRefine)
      .single();

    if (evalError || !evalData) {
      console.error("Evaluation not found:", evalError);
      return new Response(
        JSON.stringify({ error: "Evaluation not found or does not match prompt version" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    evaluation = evalData;
    analysis = evaluation.automated_analysis as TranscriptAnalysis;

    console.log("Refining prompts based on evaluation:", evaluation_id);

    // Extract issues for RAG query
    if (analysis.verbosity_score > 3) {
      issues.push("too verbose");
    }
    if (analysis.closing_effectiveness < 3) {
      issues.push("weak closing");
    }
    if (analysis.objection_handling_quality < 3) {
      issues.push("poor objection handling");
    }
    if (analysis.unnatural_phrases?.length > 0) {
      issues.push("unnatural language");
    }

    // Add specific issues from analysis
    if (analysis.specific_issues && Array.isArray(analysis.specific_issues)) {
      issues.push(...analysis.specific_issues.slice(0, 2));
    }
  }

  // Add quality feedback issues if provided
  if (quality_feedback?.issues_to_fix) {
    issues.push(...quality_feedback.issues_to_fix);
    console.log("Refining prompts based on quality feedback");
  }

  console.log("Issues identified:", issues);

  // RAG retrieval for improvement patterns
  let ragContext = "";

  if (isKnowledgeBaseAvailable() && issues.length > 0) {
    // @ts-ignore
    const agentCategory = promptVersion.prompt_generation_sessions.metadata?.agent_type_category;
    const query = buildRefinementQuery(issues, agentCategory);

    console.log("Retrieving improvement patterns from RAG:", query);

    const ragResults = await retrieveKnowledgeBaseContext(query, { numberOfResults: 6 });
    ragContext = formatRAGContext(ragResults);
  } else {
    console.warn("Knowledge Base not available or no issues identified. Refining without RAG context.");
  }

  // Generate improved prompts
  console.log("Generating improved version...");

  let refinedPrompts;

  try {
    refinedPrompts = await refinePromptsWithFeedback(
      promptVersion.base_prompt,
      promptVersion.states,
      evaluation ? {
        transcript: evaluation.transcript,
        user_rating: evaluation.user_rating,
        user_notes: evaluation.user_notes || undefined,
        automated_analysis: analysis!,
        improvement_suggestions: evaluation.improvement_suggestions || [],
      } : null, // No evaluation data for quality-only refinement
      ragContext,
      user.id,
      quality_feedback // Pass quality feedback
    );
  } catch (error) {
    console.error("Failed to generate improved prompts:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate improved prompts", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Quality validation (Phase 5.3b)
  let qualityResult: any = null;
  let qualityRegressed = false;

  if (refinedPrompts.markdown_source) {
    const { detectQualityIssues } = await import("../_shared/quality-validator.ts");
    qualityResult = detectQualityIssues(refinedPrompts.markdown_source);

    console.log(`[Quality Validation] Refined version score: ${qualityResult.score}/100`);

    if (originalQualityScore !== null) {
      qualityRegressed = qualityResult.score < originalQualityScore;
      if (qualityRegressed) {
        console.warn(`[Quality Regression] Score dropped from ${originalQualityScore} to ${qualityResult.score}`);
      }
    }
  }

  // Determine next version number
  const { data: latestVersion, error: latestError } = await supabase
    .from("prompt_versions")
    .select("version_number")
    .eq("session_id", promptVersion.session_id)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  const nextVersionNumber = latestError
    ? promptVersion.version_number + 1
    : (latestVersion.version_number + 1);

  // Store new version
  const { data: newVersion, error: newVersionError } = await supabase
    .from("prompt_versions")
    .insert({
      session_id: promptVersion.session_id,
      version_number: nextVersionNumber,
      markdown_source: refinedPrompts.markdown_source || null,
      base_prompt: refinedPrompts.base_prompt,
      states: refinedPrompts.states,
      generation_context: {
        refined_from_version: versionIdToRefine,
        refined_from_evaluation: evaluation_id || null,
        refinement_source: evaluation_id ? "evaluation_feedback" : "quality_feedback",
        issues_addressed: issues,
        rag_context_used: ragContext.length > 0,
        changes_summary: refinedPrompts.changes_summary,
        generated_at: new Date().toISOString(),
        quality_validation: qualityResult ? {
          score: qualityResult.score,
          passed: qualityResult.passed,
          issues_count: qualityResult.issues.length,
          critical_issues: qualityResult.criticalIssuesCount,
          high_severity: qualityResult.highSeverityCount,
          medium_severity: qualityResult.mediumSeverityCount,
          low_severity: qualityResult.lowSeverityCount,
          suggestions: qualityResult.suggestions,
          issues: qualityResult.issues
        } : null,
        previous_quality_score: originalQualityScore,
        quality_delta: qualityResult && originalQualityScore !== null ? qualityResult.score - originalQualityScore : null
      },
    })
    .select("id")
    .single();

  if (newVersionError || !newVersion) {
    console.error("Failed to store new version:", newVersionError);
    return new Response(
      JSON.stringify({ error: "Failed to store improved version" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log(`Created new version ${nextVersionNumber} (ID: ${newVersion.id})`);

  // Update session metadata with quality_trend (Phase 5.3c)
  if (qualityResult) {
    try {
      const { data: currentSession, error: sessionFetchError } = await supabase
        .from("prompt_generation_sessions")
        .select("metadata")
        .eq("id", promptVersion.session_id)
        .single();

      if (!sessionFetchError && currentSession) {
        const currentMetadata = currentSession.metadata || {};
        const updatedQualityTrend = [
          ...(currentMetadata.quality_trend || []),
          qualityResult.score
        ];

        await supabase
          .from("prompt_generation_sessions")
          .update({
            metadata: {
              ...currentMetadata,
              quality_trend: updatedQualityTrend,
              latest_quality_score: qualityResult.score
            }
          })
          .eq("id", promptVersion.session_id);

        console.log(`[Session] Updated quality_trend: ${updatedQualityTrend.join(" → ")}`);
      }
    } catch (metadataError) {
      console.error("Failed to update session metadata:", metadataError);
      // Don't fail the request - version is already stored
    }
  }

  const response: RefineResponse = {
    new_version_id: newVersion.id,
    version_number: nextVersionNumber,
    changes_summary: refinedPrompts.changes_summary,
    base_prompt: refinedPrompts.base_prompt,
    states: refinedPrompts.states,
    rag_context_used: ragContext.length > 0,
    quality_score: qualityResult?.score,
    quality_regressed: qualityRegressed,
    original_version: {
      id: versionIdToRefine,
      quality_score: originalQualityScore ?? undefined
    }
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
