/**
 * Analyze Feedback - Critic LLM & Pattern Extraction
 *
 * This edge function:
 * 1. Receives transcript + user feedback
 * 2. Analyzes transcript with Critic LLM
 * 3. Extracts learning patterns
 * 4. Writes patterns to S3 for RAG
 * 5. Stores evaluation in database
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";
import { requireAdmin } from "../_shared/authorization.ts";
import {
  analyzeTranscript,
  extractLearningPatterns,
  type TranscriptAnalysis,
  type ExtractedPattern,
} from "../_shared/llm-helpers.ts";
import {
  writeLearningPattern,
  isS3Available,
  type LearningPattern,
} from "../_shared/pattern-writer.ts";
import {
  isKnowledgeBaseIngestionAvailable,
  syncKnowledgeBase,
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

type FeedbackRequest = {
  prompt_version_id: string;
  transcript: string;
  user_rating: number; // 1-5
  user_notes?: string;
  test_call_metadata?: Record<string, unknown>;
};

type FeedbackResponse = {
  evaluation_id: string;
  automated_analysis: TranscriptAnalysis;
  improvement_suggestions: string[];
  patterns_extracted: number;
  patterns_written_to_s3: number;
  extracted_patterns: ExtractedPattern[];
  ingestion_result?: {
    success: boolean;
    attempts: number;
    status?: string;
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

  const {
    prompt_version_id,
    transcript,
    user_rating,
    user_notes,
    test_call_metadata,
  }: FeedbackRequest = await req.json();

  // Validate input
  if (!prompt_version_id || !transcript || !user_rating) {
    return new Response(
      JSON.stringify({ error: "prompt_version_id, transcript, and user_rating are required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (user_rating < 1 || user_rating > 5) {
    return new Response(
      JSON.stringify({ error: "user_rating must be between 1 and 5" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Verify prompt version exists and belongs to user's session
  const { data: promptVersion, error: versionError } = await supabase
    .from("prompt_versions")
    .select(`
      id,
      session_id,
      version_number,
      base_prompt,
      states,
      generation_context,
      prompt_generation_sessions!inner(
        user_id,
        agent_type_name,
        metadata
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

  // @ts-ignore - Type inference issue with nested query
  if (promptVersion.prompt_generation_sessions.user_id !== user.id) {
    return new Response(
      JSON.stringify({ error: "Unauthorized to analyze this prompt version" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log("Analyzing transcript with Critic LLM...");

  // Step 1: Analyze transcript with Critic LLM
  let automatedAnalysis: TranscriptAnalysis;

  try {
    automatedAnalysis = await analyzeTranscript(transcript, user_rating, user_notes, user.id);
  } catch (error) {
    console.error("Failed to analyze transcript:", error);
    return new Response(
      JSON.stringify({ error: "Failed to analyze transcript", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Generate improvement suggestions from analysis
  const improvementSuggestions: string[] = [];

  if (automatedAnalysis.verbosity_score > 3) {
    improvementSuggestions.push("Reduce response length - aim for 1-2 sentences per turn");
  }
  if (automatedAnalysis.closing_effectiveness < 3) {
    improvementSuggestions.push("Strengthen closing language with more assumptive phrasing");
  }
  if (automatedAnalysis.objection_handling_quality < 3) {
    improvementSuggestions.push("Improve objection handling - acknowledge, address, advance");
  }
  if (automatedAnalysis.unnatural_phrases.length > 0) {
    improvementSuggestions.push(`Remove unnatural phrases: ${automatedAnalysis.unnatural_phrases.slice(0, 2).join(", ")}`);
  }

  // Add specific issues from analysis
  improvementSuggestions.push(...automatedAnalysis.improvement_suggestions.slice(0, 3));

  // Step 2: Store evaluation
  const { data: evaluation, error: evalError } = await supabase
    .from("prompt_evaluations")
    .insert({
      prompt_version_id,
      transcript,
      user_rating,
      user_notes: user_notes || null,
      automated_analysis: automatedAnalysis,
      improvement_suggestions: improvementSuggestions,
      test_call_metadata: test_call_metadata || {},
    })
    .select("id")
    .single();

  if (evalError || !evaluation) {
    console.error("Failed to store evaluation:", evalError);
    return new Response(
      JSON.stringify({ error: "Failed to store evaluation" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // NEW: Update session metadata with feedback tracking
  console.log("Updating session metadata with feedback tracking...");

  try {
    // Load current session metadata
    const { data: currentSession, error: sessionFetchError } = await supabase
      .from("prompt_generation_sessions")
      .select("metadata")
      .eq("id", promptVersion.session_id)
      .single();

    if (sessionFetchError) {
      console.error("Failed to fetch session for metadata update:", sessionFetchError);
      // Don't fail the request - evaluation is already stored
    } else {
      const currentMetadata = currentSession?.metadata || {};

      // Extract quality score from prompt version's generation context
      const qualityScore = promptVersion.generation_context?.quality_validation?.score ?? null;

      // Build feedback history entry
      const feedbackEntry = {
        evaluation_id: evaluation.id,
        version_number: promptVersion.version_number,
        quality_score: qualityScore,
        rating: user_rating,
        tested_at: new Date().toISOString()
      };

      // Append to feedback_history array
      const updatedFeedbackHistory = [
        ...(currentMetadata.feedback_history || []),
        feedbackEntry
      ];

      // Append to quality_trend array (if quality score exists)
      let updatedQualityTrend = currentMetadata.quality_trend || [];
      if (qualityScore !== null) {
        updatedQualityTrend = [...updatedQualityTrend, qualityScore];
      }

      // Update session metadata
      const { error: metadataUpdateError } = await supabase
        .from("prompt_generation_sessions")
        .update({
          metadata: {
            ...currentMetadata,
            feedback_history: updatedFeedbackHistory,
            quality_trend: updatedQualityTrend,
            latest_quality_score: qualityScore !== null ? qualityScore : currentMetadata.latest_quality_score
          }
        })
        .eq("id", promptVersion.session_id);

      if (metadataUpdateError) {
        console.error("Failed to update session metadata:", metadataUpdateError);
        // Don't fail the request - evaluation is already stored
      } else {
        console.log(`Session metadata updated: feedback_history length=${updatedFeedbackHistory.length}, quality_trend length=${updatedQualityTrend.length}`);
      }
    }
  } catch (metadataError) {
    console.error("Error updating session metadata:", metadataError);
    // Don't fail the request - evaluation is already stored
  }

  console.log("Extracting learning patterns...");

  // Step 3: Extract learning patterns
  // @ts-ignore - Type inference issue
  const agentContext = {
    agent_type: promptVersion.prompt_generation_sessions.agent_type_name,
    // @ts-ignore
    category: promptVersion.prompt_generation_sessions.metadata?.agent_type_category,
  };

  let extractedPatterns;

  try {
    extractedPatterns = await extractLearningPatterns(
      {
        transcript,
        user_rating,
        user_notes,
        automated_analysis: automatedAnalysis,
      },
      agentContext,
      user.id
    );
  } catch (error) {
    console.error("Failed to extract patterns:", error);
    // Don't fail the request - evaluation is already stored
    extractedPatterns = [];
  }

  console.log(`Extracted ${extractedPatterns.length} learning patterns`);
  if (extractedPatterns.length > 0) {
    console.log(
      "[Feedback] Extracted patterns payload:",
      JSON.stringify(extractedPatterns, null, 2)
    );
  } else {
    console.log("[Feedback] No learning patterns extracted by LLM.");
  }

  // Step 4: Store patterns in database and write to S3
  let patternsWrittenToS3 = 0;
  const patternIdsNeedingIngestion: string[] = [];

  for (const pattern of extractedPatterns) {
    // Store in database
    const allowedPatternTypes = [
      "best_practice",
      "anti_pattern",
      "closing_technique",
      "objection_handling",
      "verbosity_rule",
      "tone_guidance",
    ];
    const normalizedPatternType = allowedPatternTypes.includes(pattern.pattern_type)
      ? pattern.pattern_type
      : "anti_pattern";

    const { data: storedPattern, error: patternError } = await supabase
      .from("learning_patterns")
      .insert({
        pattern_type: normalizedPatternType,
        agent_type_category: pattern.agent_type_category || null,
        pattern_summary: pattern.pattern_summary,
        pattern_details: pattern.pattern_details,
        evidence_count: 1,
        avg_rating_impact: null, // Will be calculated in batch processing
        source_evaluation_ids: [evaluation.id],
        kb_synced: false,
      })
      .select("id")
      .single();

    if (patternError || !storedPattern) {
      console.error("Failed to store pattern:", patternError);
      continue;
    }

    // Write to S3 for RAG
    if (isS3Available()) {
      const learningPattern: LearningPattern = {
        id: storedPattern.id,
        pattern_type: pattern.pattern_type,
        agent_type_category: pattern.agent_type_category,
        pattern_summary: pattern.pattern_summary,
        pattern_details: pattern.pattern_details,
        evidence_count: 1,
        source_evaluation_ids: [evaluation.id],
      };

      const s3Key = await writeLearningPattern(learningPattern);

      if (s3Key) {
        const { error: patternUpdateError } = await supabase
          .from("learning_patterns")
          .update({
            s3_key: s3Key,
            // Leave kb_synced=false until ingestion confirms indexing
            kb_synced: false,
            kb_synced_at: null,
          })
          .eq("id", storedPattern.id);

        if (patternUpdateError) {
          console.error("Failed to update pattern with S3 key:", patternUpdateError);
        } else {
          patternsWrittenToS3++;
          patternIdsNeedingIngestion.push(storedPattern.id);
        }
      }
    } else {
      console.warn("S3 not available. Pattern stored in database but not synced to RAG KB.");
    }
  }

  console.log(`Written ${patternsWrittenToS3}/${extractedPatterns.length} patterns to S3`);

  // If this is a high-rated version (4-5 stars), consider it a golden example
  let goldenExampleKey: string | null = null;
  if (user_rating >= 4 && isS3Available()) {
    console.log("High rating detected. Storing as golden example...");

    const { writeGoldenExample } = await import("../_shared/pattern-writer.ts");

    goldenExampleKey = await writeGoldenExample({
      // @ts-ignore
      agent_type: promptVersion.prompt_generation_sessions.agent_type_name,
      version: promptVersion.version_number,
      rating: user_rating,
      base_prompt: promptVersion.base_prompt,
      states: promptVersion.states,
      generation_context: promptVersion.generation_context,
    });
  }

  // Trigger KB ingestion if needed
  const ingestionNeeded = patternIdsNeedingIngestion.length > 0 || Boolean(goldenExampleKey);
  let kbSyncedPatternCount = 0;
  let ingestionInfo:
    | {
        success: boolean;
        attempts: number;
        status?: string;
        job_id?: string;
      }
    | undefined;

  if (ingestionNeeded) {
    if (!isS3Available()) {
      console.warn("[Feedback] S3 is unavailable, skipping KB ingestion trigger.");
      ingestionInfo = { success: false, attempts: 0, status: "S3_UNAVAILABLE" };
    } else if (!isKnowledgeBaseIngestionAvailable()) {
      console.warn("[Feedback] KB ingestion not configured. Patterns remain unsynced.");
      ingestionInfo = { success: false, attempts: 0, status: "INGESTION_NOT_CONFIGURED" };
    } else {
      console.log("[Feedback] Triggering Knowledge Base ingestion to index new documents...");

      const maxAttempts = 3;
      let attempt = 0;
      let ingestionAttempts = 0;
      let ingestionResult = await syncKnowledgeBase();
      ingestionAttempts++;
      while (!ingestionResult.success && attempt < maxAttempts - 1) {
        attempt++;
        ingestionAttempts++;
        const waitMs = 2000 * attempt;
        console.warn(
          `[Feedback] Ingestion attempt ${attempt} failed (status=${ingestionResult.status}). Retrying in ${waitMs}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        ingestionResult = await syncKnowledgeBase();
      }

      ingestionInfo = {
        success: ingestionResult.success,
        attempts: ingestionAttempts,
        status: ingestionResult.status,
        job_id: ingestionResult.jobId ?? undefined,
      };
      console.log("[Feedback] Ingestion result:", JSON.stringify(ingestionInfo));

      if (ingestionResult.success) {
        console.log(
          `[Feedback] Ingestion job ${ingestionResult.jobId} completed successfully. Marking patterns as synced.`
        );

        if (patternIdsNeedingIngestion.length > 0) {
          const { error: kbUpdateError } = await supabase
            .from("learning_patterns")
            .update({
              kb_synced: true,
              kb_synced_at: new Date().toISOString(),
            })
            .in("id", patternIdsNeedingIngestion);

          if (kbUpdateError) {
            console.error("Failed to mark patterns as KB-synced:", kbUpdateError);
          } else {
            kbSyncedPatternCount = patternIdsNeedingIngestion.length;
          }
        }
      } else {
        console.warn(
          `[Feedback] Ingestion job failed or timed out after ${maxAttempts} attempts (status=${ingestionResult.status}). Patterns remain pending.`
        );
      }
    }
  }

  if (patternIdsNeedingIngestion.length > 0) {
    console.log(
      `[Feedback] Patterns pending KB sync: ${patternIdsNeedingIngestion.length - kbSyncedPatternCount}`
    );
  }

  const response: FeedbackResponse = {
    evaluation_id: evaluation.id,
    automated_analysis: automatedAnalysis,
    improvement_suggestions: improvementSuggestions,
    patterns_extracted: extractedPatterns.length,
    patterns_written_to_s3: patternsWrittenToS3,
    extracted_patterns: extractedPatterns,
    ingestion_result: ingestionInfo,
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
