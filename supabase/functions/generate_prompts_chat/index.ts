/**
 * Generate Prompts Chat - Conversational AI Prompt Generation
 *
 * This edge function manages conversational sessions where the user
 * interacts with a Generator LLM to create new AI agent prompts.
 *
 * Flow:
 * 1. Create/resume session
 * 2. User sends message
 * 3. LLM asks clarifying questions OR generates prompts when ready
 * 4. RAG retrieval provides relevant patterns
 * 5. Store conversation history and generated prompts
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";
import { requireAdmin } from "../_shared/authorization.ts";
import {
  type Message,
  type GenerationMetadata,
} from "../_shared/llm-helpers.ts";
import {
  retrieveKnowledgeBaseContext,
  formatRAGContext,
  buildAgentTypeQuery,
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
const MIN_CONFIDENCE_FOR_GENERATION = Number(
  Deno.env.get("PROMPT_FACTORY_MIN_CONFIDENCE") ?? "0.65"
);

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

type ProgressEvent = {
  phase: string;
  status: string;
  detail?: string;
  timestamp: string;
};

type ChatRequest = {
  action: "start" | "message" | "generate" | "get_session";
  session_id?: string;
  message?: string;
  agent_type_name?: string; // For "start" action
  example_scripts?: string; // For "start" action - optional example conversation scripts
  quality_feedback?: {
    previous_score: number;
    issues_to_fix: string[];
    suggestions: string[];
  }; // For "generate" action - quality issues from previous generation
};

type ChatResponse = {
  session_id: string;
  status: "conversation" | "ready_to_generate" | "generated";
  assistant_message?: string;
  metadata?: Record<string, unknown>;
  generated_prompts?: {
    base_prompt: string;
    states: unknown[];
  };
  prompt_version_id?: string;
  conversation_history?: Message[];
  version_number?: number;
  progress_events?: ProgressEvent[];
  rag_contexts?: Record<string, string>;
  flow_analysis?: Record<string, unknown>;
  quality_validation?: {
    score: number;
    passed: boolean;
    issues_count: number;
    critical_issues: number;
    high_severity: number;
    medium_severity: number;
    low_severity: number;
    suggestions: string[];
    issues: Array<{
      type: string;
      severity: string;
      message: string;
      location?: string;
      lineNumber?: number;
      suggestion?: string;
    }>;
  };
};

function sanitizeMetadataValue(value?: string | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.toLowerCase();
  if (normalized === "unknown" || normalized === "missing") {
    return undefined;
  }
  return trimmed;
}

/**
 * Extract metadata from conversation history using LLM
 */
async function extractMetadata(conversation: Message[]): Promise<GenerationMetadata> {
  const conversationText = conversation
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const { LLM } = await import("../_shared/llm.ts");

  const prompt = `Extract structured metadata from this conversation about creating an AI voice sales agent:

${conversationText}

Extract and INFER the following 3 REQUIRED fields:
- lead_type: What type of leads/prospects are being called (e.g., "commercial property owners", "expired listing homeowners", "distressed property owners")
- primary_goal: Main objective of the calls (e.g., "get them interested in receiving an offer and schedule callback", "book appointments", "qualify leads")
- audience: Target audience description (e.g., "commercial property owners (cold outbound)", "homeowners with expired listings", "real estate investors")

IMPORTANT: Be aggressive in inferring these fields from context. If the user mentions:
- The type of property/business → that's the lead_type
- What the agent should accomplish → that's the primary_goal
- Who owns the properties → that's the audience

Return ONLY valid JSON with ALL 3 fields:
{
  "lead_type": "...",
  "primary_goal": "...",
  "audience": "..."
}`;

  try {
    const result = await LLM.generateJSON(prompt);
    return result as GenerationMetadata;
  } catch (error) {
    console.error("Failed to extract metadata with LLM:", error);
    // Return empty metadata as fallback
    return {};
  }
}

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

  const { action, session_id, message, agent_type_name, example_scripts, quality_feedback }: ChatRequest = await req.json();

  // ============================================================================
  // ACTION: Start New Session
  // ============================================================================
  if (action === "start") {
    if (!agent_type_name || agent_type_name.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "agent_type_name is required for start action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const initialMessage: Message = {
      role: "assistant",
      content: "Hi! Let's create a new AI voice agent. What type of leads will this agent handle?",
      timestamp: new Date().toISOString(),
    };

    // Build metadata with optional example scripts
    const sessionMetadata: Record<string, unknown> = {};
    if (example_scripts && example_scripts.trim().length > 0) {
      sessionMetadata.example_scripts = example_scripts.trim();
      console.log(`[Start Session] Example scripts provided (${example_scripts.length} chars)`);
    }

    const { data: newSession, error: sessionError } = await supabase
      .from("prompt_generation_sessions")
      .insert({
        user_id: user.id,
        agent_type_name: agent_type_name.trim(),
        status: "in_progress",
        conversation_history: [initialMessage],
        metadata: Object.keys(sessionMetadata).length > 0 ? sessionMetadata : {},
      })
      .select("id, conversation_history, metadata")
      .single();

    if (sessionError || !newSession) {
      console.error("Failed to create session:", sessionError);
      return new Response(
        JSON.stringify({ error: "Failed to create session" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response: ChatResponse = {
      session_id: newSession.id,
      status: "conversation",
      assistant_message: initialMessage.content,
      metadata: {},
      conversation_history: [initialMessage],
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ============================================================================
  // ACTION: Get Session (Load existing session)
  // ============================================================================
  if (action === "get_session") {
    if (!session_id) {
      return new Response(
        JSON.stringify({ error: "session_id is required for get_session action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: session, error: fetchError } = await supabase
      .from("prompt_generation_sessions")
      .select("id, conversation_history, metadata, status")
      .eq("id", session_id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !session) {
      return new Response(
        JSON.stringify({ error: "Session not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if prompts were generated for this session
    const { data: promptVersions, error: versionsError } = await supabase
      .from("prompt_versions")
      .select("id, version_number, base_prompt, states, generation_context, created_at")
      .eq("session_id", session_id)
      .order("version_number", { ascending: false })
      .limit(1);

    const latestVersion = promptVersions && promptVersions.length > 0 ? promptVersions[0] : null;

    const sessionMetadata = session.metadata || {};

    const response: ChatResponse = {
      session_id: session.id,
      status: latestVersion ? "generated" : (session.status === "ready_to_generate" ? "ready_to_generate" : "conversation"),
      metadata: sessionMetadata,
      conversation_history: session.conversation_history || [],
      progress_events: sessionMetadata.progress_history || [],
    };

    // Include generated prompts if they exist
    if (latestVersion) {
      response.generated_prompts = {
        base_prompt: latestVersion.base_prompt,
        states: latestVersion.states,
      };
      response.prompt_version_id = latestVersion.id;
      response.version_number = latestVersion.version_number;
      if (latestVersion.generation_context?.rag_contexts) {
        response.rag_contexts = latestVersion.generation_context.rag_contexts;
      }
      if (latestVersion.generation_context?.progress_events) {
        response.progress_events = latestVersion.generation_context.progress_events;
      }
      if (latestVersion.generation_context?.flow_analysis) {
        response.flow_analysis = latestVersion.generation_context.flow_analysis;
      }
      if (latestVersion.generation_context?.quality_validation) {
        response.quality_validation = latestVersion.generation_context.quality_validation;
      }
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ============================================================================
  // ACTION: Send Message
  // ============================================================================
  if (action === "message") {
    if (!session_id || !message) {
      return new Response(
        JSON.stringify({ error: "session_id and message are required for message action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load session
    const { data: session, error: fetchError } = await supabase
      .from("prompt_generation_sessions")
      .select("id, conversation_history, metadata, status")
      .eq("id", session_id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !session) {
      return new Response(
        JSON.stringify({ error: "Session not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Add user message
    const userMessage: Message = {
      role: "user",
      content: message.trim(),
      timestamp: new Date().toISOString(),
    };

    const updatedConversation: Message[] = [
      ...(session.conversation_history || []),
      userMessage,
    ];

    // ========= NEW CONFIDENCE-BASED SYSTEM =========

    // Check if we need to extract (caching)
    const lastExtraction = session.metadata?.enhanced_metadata;
    const shouldExtract = !lastExtraction ||
                          (updatedConversation.length - (lastExtraction.at_message_count || 0)) >= 2;

    let enhanced: any;

    if (shouldExtract) {
      // Extract basic metadata
      const metadata = await extractMetadata(updatedConversation);
      console.log("Extracted metadata:", JSON.stringify(metadata, null, 2));

      // Assess quality with confidence scores
      const { assessMetadataQuality } = await import("../_shared/llm-helpers.ts");
      enhanced = await assessMetadataQuality(metadata, updatedConversation, user.id);

      console.log("Enhanced metadata with confidence:", JSON.stringify(enhanced, null, 2));
    } else {
      // Use cached extraction
      console.log("Using cached metadata extraction");
      enhanced = lastExtraction;
    }

    // Count questions asked (user messages)
    const questionsAsked = updatedConversation.filter(m => m.role === "user").length;

    // Decide next action based on confidence
    const { decideNextAction, generateTargetedQuestion } = await import("../_shared/llm-helpers.ts");
    const decision = decideNextAction(enhanced, questionsAsked);

    console.log("Decision:", JSON.stringify(decision, null, 2));

    let assistantMessage: string;
    let status: "conversation" | "ready_to_generate" = "conversation";

    if (decision.should_generate) {
      assistantMessage = "Perfect! I have all the information I need. Ready to generate your agent prompts?";
      status = "ready_to_generate";
      console.log(`Ready to generate: ${decision.reason}`);
    } else {
      // Generate targeted question
      assistantMessage = await generateTargetedQuestion(updatedConversation, enhanced, decision, user.id);
      console.log(`Asking another question: ${decision.reason}`);
    }

    const assistantMsg: Message = {
      role: "assistant",
      content: assistantMessage,
      timestamp: new Date().toISOString(),
    };

    updatedConversation.push(assistantMsg);

    // Update session - store enhanced metadata for caching
    const { error: updateError } = await supabase
      .from("prompt_generation_sessions")
      .update({
        conversation_history: updatedConversation,
        metadata: {
          ...session.metadata, // Preserve existing fields like example_scripts
          enhanced_metadata: enhanced,
          // Keep legacy metadata for backwards compatibility
          lead_type: enhanced.lead_type.value,
          primary_goal: enhanced.primary_goal.value,
          audience: enhanced.audience.value,
          overall_confidence: enhanced.overall_confidence
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    if (updateError) {
      console.error("Failed to update session:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update session" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response: ChatResponse = {
      session_id,
      status,
      assistant_message: assistantMessage,
      metadata: {
        lead_type: enhanced.lead_type.value,
        primary_goal: enhanced.primary_goal.value,
        audience: enhanced.audience.value,
        overall_confidence: enhanced.overall_confidence
      },
      conversation_history: updatedConversation,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ============================================================================
  // ACTION: Generate Prompts
  // ============================================================================
  if (action === "generate") {
    if (!session_id) {
      return new Response(
        JSON.stringify({ error: "session_id is required for generate action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load session
    const { data: session, error: fetchError } = await supabase
      .from("prompt_generation_sessions")
      .select("*")
      .eq("id", session_id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !session) {
      return new Response(
        JSON.stringify({ error: "Session not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const metadataEnvelope = session.metadata || {};
    const enhancedMetadata = metadataEnvelope.enhanced_metadata ?? null;
    const overallConfidence =
      enhancedMetadata?.overall_confidence ??
      metadataEnvelope.overall_confidence ??
      0;

    const usableMetadata: GenerationMetadata = {
      lead_type: sanitizeMetadataValue(metadataEnvelope.lead_type),
      primary_goal: sanitizeMetadataValue(metadataEnvelope.primary_goal),
      audience: sanitizeMetadataValue(metadataEnvelope.audience),
      tone: metadataEnvelope.tone,
      objections: metadataEnvelope.objections,
    };

    const missingFields = ["lead_type", "primary_goal", "audience"].filter(
      (field) => !usableMetadata[field as keyof GenerationMetadata]
    );

    const existingProgressHistory: ProgressEvent[] = [];

    const baseMetadataForProgress = {
      ...metadataEnvelope,
      lead_type: usableMetadata.lead_type ?? metadataEnvelope.lead_type,
      primary_goal: usableMetadata.primary_goal ?? metadataEnvelope.primary_goal,
      audience: usableMetadata.audience ?? metadataEnvelope.audience,
      overall_confidence: overallConfidence,
    };

    // Declare variables outside try block so they're accessible in storage section
    let generatedPrompts: any;
    let markdownSource = "";
    let ragContexts: Record<string, string> = {
      quality_principles: "",
      gold_examples: "",
      positive_patterns: "",
      anti_patterns: ""
    };
    let flowAnalysis: any = null;
    let qualityResult: any = null;

    const progressEvents: ProgressEvent[] = [];

    // Helper function to update progress
    const updateProgress = async (phase: string, status: string, detail?: string) => {
      const event: ProgressEvent = {
        phase,
        status,
        detail,
        timestamp: new Date().toISOString(),
      };
      progressEvents.push(event);
      existingProgressHistory.push(event);

      await supabase
        .from("prompt_generation_sessions")
        .update({
          metadata: {
            ...baseMetadataForProgress,
            progress: event,
            progress_history: existingProgressHistory,
          }
        })
        .eq("id", session_id);
      console.log(`[Progress] ${phase}: ${status}${detail ? ` - ${detail}` : ''}`);
    };

    try {
      // Phase 1: Validation
      await updateProgress("validation", "checking", "Validating metadata");
      if (missingFields.length > 0) {
        await updateProgress(
          "validation",
          "failed",
          `Missing metadata fields: ${missingFields.join(", ")}`
        );
        const failurePayload = {
          error: "Not enough information collected. Continue conversation first.",
          missing_fields: missingFields,
          metadata: {
            ...baseMetadataForProgress,
            progress_history: existingProgressHistory,
          },
          progress_events: progressEvents,
        };
        return new Response(JSON.stringify(failurePayload), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (overallConfidence < MIN_CONFIDENCE_FOR_GENERATION) {
        await updateProgress(
          "validation",
          "failed",
          `Overall confidence ${overallConfidence.toFixed(2)} below threshold ${MIN_CONFIDENCE_FOR_GENERATION}`
        );
        const failurePayload = {
          error:
            "Not enough high-confidence information. Continue conversation to clarify requirements.",
          overall_confidence: overallConfidence,
          required_confidence: MIN_CONFIDENCE_FOR_GENERATION,
          metadata: {
            ...baseMetadataForProgress,
            progress_history: existingProgressHistory,
          },
          progress_events: progressEvents,
        };
        return new Response(JSON.stringify(failurePayload), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await updateProgress("validation", "complete", "Metadata validated");

      // Phase 2: RAG retrieval (4 targeted queries for balanced context)
      await updateProgress("rag", "retrieving", "Searching Knowledge Base");
      console.log("Retrieving RAG context with split queries for:", usableMetadata.lead_type);

      if (isKnowledgeBaseAvailable()) {
        // Query 1: Universal quality principles
        const qualityQuery = "Universal quality principles for natural AI voice agents";

        // Query 2: Gold examples for structure
        const goldQuery = `Complete prompt structure and implementation for ${
          usableMetadata.lead_type || "sales agent"
        }`;

        // Query 3: Successful patterns
        const positiveQuery = buildAgentTypeQuery(
          usableMetadata.lead_type || "sales agent",
          ["successful techniques", "best practices", "what works well"]
        );

        // Query 4: Anti-patterns
        const antiQuery = buildAgentTypeQuery(
          usableMetadata.lead_type || "sales agent",
          ["anti-patterns", "common mistakes", "things to avoid"]
        );

        console.log("[RAG] Executing 4 parallel queries...");
        const startTime = Date.now();

        // Execute all queries in parallel
        const [qualityResults, goldResults, positiveResults, antiResults] = await Promise.all([
          retrieveKnowledgeBaseContext(qualityQuery, { numberOfResults: 2 }),
          retrieveKnowledgeBaseContext(goldQuery, { numberOfResults: 2 }),
          retrieveKnowledgeBaseContext(positiveQuery, { numberOfResults: 3 }),
          retrieveKnowledgeBaseContext(antiQuery, { numberOfResults: 3 })
        ]);

        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        console.log(`[RAG] 4 queries completed in ${duration}s`);

        // Import new formatter
        const { formatSplitRAGContext } = await import("../_shared/bedrock-rag.ts");

        ragContexts = formatSplitRAGContext({
          quality_principles: formatRAGContext(qualityResults),
          gold_examples: formatRAGContext(goldResults),
          positive_patterns: formatRAGContext(positiveResults),
          anti_patterns: formatRAGContext(antiResults)
        });

        const totalChunks = qualityResults.length + goldResults.length + positiveResults.length + antiResults.length;
        await updateProgress("rag", "complete", `Found ${totalChunks} chunks (${duration}s): ${qualityResults.length} principles, ${goldResults.length} examples, ${positiveResults.length} patterns, ${antiResults.length} anti-patterns`);
      } else {
        console.warn("Knowledge Base not available. Generating without RAG context.");
        await updateProgress("rag", "skipped", "Knowledge Base not available");
      }

      // Phase 2.5: Flow Analysis (if example scripts provided)
      if (session.metadata?.example_scripts) {
        try {
          await updateProgress("flow_analysis", "analyzing", "Analyzing example conversation scripts");
          console.log("[Flow Analysis] Example scripts detected, analyzing conversational flow...");

          const { analyzeConversationalFlow } = await import("../_shared/llm-helpers.ts");

          // Analyze the scripts
          flowAnalysis = await analyzeConversationalFlow(
            [session.metadata.example_scripts], // Array of scripts
            usableMetadata,
            user.id
          );

          await updateProgress("flow_analysis", "complete",
            `${flowAnalysis.structure_type} structure, ${flowAnalysis.confidence.toFixed(2)} confidence`
          );

          console.log(`[Flow Analysis] Complete: ${flowAnalysis.structure_type}, confidence ${flowAnalysis.confidence}`);
        } catch (error: any) {
          console.error("[Flow Analysis] Failed:", error);
          await updateProgress("flow_analysis", "failed", error.message);
          // Continue without flow analysis (non-blocking)
        }
      }

      // Phase 2.6: Quality Feedback Injection (if regenerating with feedback)
      if (quality_feedback && quality_feedback.issues_to_fix.length > 0) {
        console.log(`[Quality Feedback] Regenerating with feedback from previous score: ${quality_feedback.previous_score}`);
        console.log(`[Quality Feedback] Issues to fix: ${quality_feedback.issues_to_fix.join("; ")}`);

        // Build solution-focused guidance based on detected issues
        const structureGuidance = quality_feedback.issues_to_fix.some(i =>
          i.includes("numbered") || i.includes("Numbered") || i.includes("Step")
        ) ? `
✓ **Structure**: Use flow-based ## section headers (like "## Opening Hook" or "## Discovery Phase") that describe conversational goals and strategies. This enables natural adaptation instead of mechanical execution.

Example:
## Confirming Contact
Make sure you're speaking with the right person naturally - use their first name conversationally.
If it's not them, ask for the homeowner. If you can't reach them, wrap up politely.` : '';

        const scriptGuidance = quality_feedback.issues_to_fix.some(i =>
          i.includes("script") || i.includes("quoted") || i.includes("Say:")
        ) ? `
✓ **Communication Style**: Teach conversation strategies and principles, not word-for-word scripts. Guide HOW to communicate (strategic principles), not WHAT to say (literal dialogue).

Instead of: Say: "Hi there, I'm calling about..."
Use: Open naturally by confirming who you're speaking with and quickly stating your purpose without sounding scripted.` : '';

        const toneGuidance = quality_feedback.issues_to_fix.some(i =>
          i.includes("robotic") || i.includes("Robotic") || i.includes("AI phrase")
        ) ? `
✓ **Natural Tone**: Use conversational human language. Think casual professional, not corporate AI assistant.

Examples: "Fair point", "Got it", "So here's the thing...", "Let me ask you this...", "Makes sense"
Avoid: "I understand your concern", "I appreciate your perspective", "Thank you for sharing"` : '';

        const lengthGuidance = quality_feedback.issues_to_fix.some(i =>
          i.includes("sentence") || i.includes("verbose") || i.includes("brief")
        ) ? `
✓ **Response Length**: Emphasize one-sentence responses for natural conversation flow. Real people don't give multi-sentence answers to simple questions.

Target: One sentence per response typically. Two sentences only when absolutely necessary (complex explanations).` : '';

        // Prepend quality improvement guidance to ragContexts
        const feedbackSection = `<!-- QUALITY_FEEDBACK_START -->
## 🎯 QUALITY IMPROVEMENTS FOR THIS GENERATION

**Previous Attempt Score**: ${quality_feedback.previous_score}/100

This is a regeneration. Apply these improvements to create a higher-quality prompt:
${structureGuidance}${scriptGuidance}${toneGuidance}${lengthGuidance}

**Key Principle**: Your prompt can be detailed to teach thinking and principles, but it should guide the agent to produce SHORT, natural responses. Detailed guidance enables concise execution.

---

<!-- QUALITY_FEEDBACK_END -->
`;

        // Prepend to quality_principles section (or create new section if RAG not available)
        ragContexts.quality_principles = feedbackSection + (ragContexts.quality_principles || "## UNIVERSAL QUALITY PRINCIPLES\n\n(Using baseline guidance)");
      }

      // Phase 3: LLM Generation (with quality validation - manual approval)
      await updateProgress("llm", "generating", quality_feedback ? "Regenerating with quality feedback" : "Creating prompts with AI");
      console.log("Generating prompts with markdown format...");

      // Import required functions
      const { generateAgentPromptsMarkdown } = await import("../_shared/llm-helpers.ts");
      const { compilePromptSections } = await import("../_shared/prompt-compiler.ts");
      const { detectQualityIssues } = await import("../_shared/quality-validator.ts");

      // Step 1: Generate markdown with split RAG contexts + flow analysis
      markdownSource = await generateAgentPromptsMarkdown(
        usableMetadata,
        ragContexts,
        user.id,
        flowAnalysis || undefined // Pass flow analysis if available
      );
      console.log(`Generated markdown: ${markdownSource.length} chars`);
      await updateProgress("llm", "complete", `Generated ${markdownSource.length} chars`);

      // Phase 3.5: Quality Validation
      await updateProgress("validation", "checking", "Validating prompt quality");
      qualityResult = detectQualityIssues(markdownSource);

      console.log(`[Quality Validation] Score: ${qualityResult.score}/100, Issues: ${qualityResult.issues.length}`);
      console.log(`[Quality Validation] Critical: ${qualityResult.criticalIssuesCount}, High: ${qualityResult.highSeverityCount}, Medium: ${qualityResult.mediumSeverityCount}`);

      // Always proceed with generation, but flag quality status
      if (qualityResult.passed) {
        await updateProgress("validation", "complete", `Quality score: ${qualityResult.score}/100 ✓`);
      } else {
        // Log issues but don't block - user can manually regenerate if needed
        const issuesSummary = qualityResult.issues
          .filter((i: any) => i.severity === "critical" || i.severity === "high")
          .map((i: any) => i.message)
          .slice(0, 5)
          .join("; ");

        await updateProgress("validation", "warning", `Score ${qualityResult.score}/100 - Review issues before using`);
        console.warn(`[Quality Validation] Failed with score ${qualityResult.score}. Issues: ${issuesSummary}`);
        console.log(`[Quality Validation] Proceeding with generation. User can manually regenerate if needed.`);
      }

      // Phase 4: Compilation
      await updateProgress("compile", "processing", "Compiling to Retell format");
      const compiled = compilePromptSections(markdownSource);
      console.log(`Compiled to Retell format: ${compiled.states.length} states`);
      await updateProgress("compile", "complete", `Compiled ${compiled.states.length} states`);

      generatedPrompts = compiled;

      // Phase 5: Storage (will be updated after successful insert)
      await updateProgress("storage", "saving", "Storing prompt version");

    } catch (error) {
      console.error("Failed to generate prompts:", error);
      await updateProgress("error", "failed", String(error));
      const failurePayload = {
        error: "Failed to generate prompts",
        details: String(error),
        metadata: {
          ...baseMetadataForProgress,
          progress_history: existingProgressHistory,
        },
        progress_events: progressEvents,
      };
      return new Response(JSON.stringify(failurePayload), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine next version number for this session
    let nextVersionNumber = 1;
    const { data: latestVersionData, error: latestVersionError } = await supabase
      .from("prompt_versions")
      .select("version_number")
      .eq("session_id", session_id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestVersionError && latestVersionError.code !== "PGRST116") {
      console.error("Failed to fetch latest version number:", latestVersionError);
    }

    if (latestVersionData?.version_number && typeof latestVersionData.version_number === "number") {
      nextVersionNumber = latestVersionData.version_number + 1;
    }

    // Store prompt version (with markdown source)
    const generationContext: Record<string, any> = {
      metadata: usableMetadata,
      rag_split_contexts_used: Object.values(ragContexts).some(v => v.length > 0),
      rag_retrieval_method: "split_4query", // Track that we used split retrieval
      format: "markdown_compiled", // NEW: Track generation format
      generated_at: new Date().toISOString(),
      rag_contexts: ragContexts,
      progress_events: progressEvents,
      quality_validation: qualityResult ? {
        score: qualityResult.score,
        passed: qualityResult.passed,
        issues_count: qualityResult.issues.length,
        critical_issues: qualityResult.criticalIssuesCount,
        high_severity: qualityResult.highSeverityCount,
        medium_severity: qualityResult.mediumSeverityCount,
        low_severity: qualityResult.lowSeverityCount,
        suggestions: qualityResult.suggestions,
        issues: qualityResult.issues // Store full issues for debugging
      } : null,
    };

    // Add flow analysis if it was performed
    if (flowAnalysis) {
      generationContext.flow_analysis = flowAnalysis;
    }

    const { data: promptVersion, error: versionError } = await supabase
      .from("prompt_versions")
      .insert({
        session_id,
        version_number: nextVersionNumber,
        markdown_source: markdownSource, // NEW: Store human-readable source
        base_prompt: generatedPrompts.base_prompt,
        states: generatedPrompts.states,
        generation_context: generationContext,
      })
      .select("id")
      .single();

    if (versionError || !promptVersion) {
      console.error("Failed to store prompt version:", versionError);
      await updateProgress("error", "failed", "Failed to store version");
      const failurePayload = {
        error: "Failed to store generated prompts",
        metadata: {
          ...baseMetadataForProgress,
          progress_history: existingProgressHistory,
        },
        progress_events: progressEvents,
      };
      return new Response(JSON.stringify(failurePayload), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Final progress update
    await updateProgress(
      "done",
      "complete",
      `Version ${nextVersionNumber} created (id: ${promptVersion.id})`
    );

    // Update session status and initialize quality_trend
    await supabase
      .from("prompt_generation_sessions")
      .update({
        status: "testing",
        metadata: {
          ...baseMetadataForProgress,
          progress: {
            phase: "done",
            status: "complete",
            detail: `Generation complete - version ${nextVersionNumber} (id ${promptVersion.id})`,
            timestamp: new Date().toISOString()
          },
          progress_history: existingProgressHistory,
          // Initialize quality_trend with first score (or append if regenerating)
          quality_trend: [
            ...(baseMetadataForProgress.quality_trend || []),
            qualityResult?.score ?? 0
          ].filter(score => score > 0), // Filter out any 0 scores
          latest_quality_score: qualityResult?.score ?? baseMetadataForProgress.latest_quality_score,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    const response: ChatResponse = {
      session_id,
      status: "generated",
      metadata: {
        ...usableMetadata,
        overall_confidence: overallConfidence,
      },
      generated_prompts: {
        base_prompt: generatedPrompts.base_prompt,
        states: generatedPrompts.states,
      },
      prompt_version_id: promptVersion.id,
      version_number: nextVersionNumber,
      progress_events: progressEvents,
      rag_contexts: ragContexts,
      ...(flowAnalysis && { flow_analysis: flowAnalysis }),
      ...(qualityResult && { quality_validation: {
        score: qualityResult.score,
        passed: qualityResult.passed,
        issues_count: qualityResult.issues.length,
        critical_issues: qualityResult.criticalIssuesCount,
        high_severity: qualityResult.highSeverityCount,
        medium_severity: qualityResult.mediumSeverityCount,
        low_severity: qualityResult.lowSeverityCount,
        suggestions: qualityResult.suggestions,
        issues: qualityResult.issues
      }}),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Invalid action
  return new Response(
    JSON.stringify({ error: "Invalid action. Must be: start, message, generate, or get_session" }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});

serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return handler(req);
});
