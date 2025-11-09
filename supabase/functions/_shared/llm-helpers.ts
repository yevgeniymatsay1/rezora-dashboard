/**
 * Enhanced LLM Helpers for Prompt Factory
 *
 * Provides specialized LLM functions for:
 * - Generator LLM (conversational prompt generation)
 * - Critic LLM (transcript analysis & feedback)
 * - Placeholder Analyzer LLM (auto-suggest placeholders)
 * - Pattern Extractor LLM (learning from evaluations)
 */

import { LLM } from "./llm.ts";
import { getPlaceholderGuidance } from "./placeholder-semantic-mapping.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export interface GenerationMetadata {
  lead_type?: string;
  primary_goal?: string;
  audience?: string;
  tone?: string;
  objections?: string[];
  [key: string]: unknown;
}

/**
 * Enhanced metadata with confidence scoring
 */

// Default system prompt for Metadata Assessor LLM
const DEFAULT_METADATA_ASSESSOR_PROMPT = `Analyze this metadata extracted from a conversation about creating an AI agent:

{{CONVERSATION_AND_METADATA}}

For each field, rate its SPECIFICITY and ACTIONABILITY (0-1):

**Confidence Scoring Guide:**
- 0.0-0.3 = Too vague (e.g., "leads", "people", "customers", "sell")
- 0.4-0.6 = Somewhat specific (e.g., "property owners", "schedule calls")
- 0.7-0.9 = Specific (e.g., "commercial property owners facing foreclosure", "book 15-min appointments")
- 1.0 = Very specific with context (e.g., "distressed commercial property owners within 90 days of foreclosure", "qualify and book property walkthrough within 48 hours")

IMPORTANT: Set needs_clarification=true if confidence < 0.6

Return ONLY valid JSON:
{
  "lead_type": {
    "value": "extracted value or MISSING",
    "confidence": 0.75,
    "reasoning": "Brief explanation of score",
    "needs_clarification": false
  },
  "primary_goal": {
    "value": "...",
    "confidence": 0.60,
    "reasoning": "...",
    "needs_clarification": true
  },
  "audience": {
    "value": "...",
    "confidence": 0.85,
    "reasoning": "...",
    "needs_clarification": false
  },
  "overall_confidence": 0.73,
  "conversation_summary": "One sentence summary of what user wants to create"
}`;

export interface FieldConfidence {
  value: string;
  confidence: number; // 0-1 score
  reasoning?: string; // Why this confidence score
  needs_clarification: boolean;
}

export interface EnhancedMetadata {
  lead_type: FieldConfidence;
  primary_goal: FieldConfidence;
  audience: FieldConfidence;

  overall_confidence: number; // Average of all fields
  conversation_summary?: string; // Key points extracted
  clarifications_made?: string[]; // What user clarified

  // Track extraction to enable caching
  last_extracted_at?: string;
  extraction_count?: number;
  at_message_count?: number; // Which message # extraction was done
}

/**
 * ============================================================================
 * PROMPT FACTORY SETTINGS
 * ============================================================================
 */

export interface PromptFactorySettings {
  generator_temperature: number;
  generator_system_prompt: string | null;
  question_generator_temperature: number;
  refinement_temperature: number;
  script_analyzer_temperature: number;
  critic_temperature: number;
  critic_system_prompt: string | null;
  pattern_extractor_temperature: number;
  pattern_extractor_system_prompt: string | null;
  placeholder_analyzer_temperature: number;
  placeholder_analyzer_system_prompt: string | null;
  metadata_assessor_temperature: number;
  metadata_assessor_system_prompt: string | null;
}

// Default settings (fallback if database unavailable)
const DEFAULT_SETTINGS: PromptFactorySettings = {
  generator_temperature: 0.2,
  generator_system_prompt: null,
  question_generator_temperature: 0.2,
  refinement_temperature: 0.1,
  script_analyzer_temperature: 0.2,
  critic_temperature: 0.1,
  critic_system_prompt: null,
  pattern_extractor_temperature: 0.1,
  pattern_extractor_system_prompt: null,
  placeholder_analyzer_temperature: 0.1,
  placeholder_analyzer_system_prompt: null,
  metadata_assessor_temperature: 0.1,
  metadata_assessor_system_prompt: null,
};

// Settings cache to avoid repeated database calls
let settingsCache: Map<string, { settings: PromptFactorySettings; timestamp: number }> = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch Prompt Factory settings for a user
 * Uses cache to minimize database calls
 */
async function getPromptFactorySettings(userId: string): Promise<PromptFactorySettings> {
  // Check cache first
  const cached = settingsCache.get(userId);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    return cached.settings;
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.warn("[getPromptFactorySettings] Missing Supabase credentials, using defaults");
      return DEFAULT_SETTINGS;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from("prompt_factory_settings")
      .select(`
        generator_temperature,
        generator_system_prompt,
        question_generator_temperature,
        refinement_temperature,
        script_analyzer_temperature,
        critic_temperature,
        critic_system_prompt,
        pattern_extractor_temperature,
        pattern_extractor_system_prompt,
        placeholder_analyzer_temperature,
        placeholder_analyzer_system_prompt,
        metadata_assessor_temperature,
        metadata_assessor_system_prompt
      `)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn(`[getPromptFactorySettings] Database error: ${error.message}, using defaults`);
      return DEFAULT_SETTINGS;
    }

    // Merge with defaults (in case some fields are null)
    const settings: PromptFactorySettings = {
      generator_temperature: data?.generator_temperature ?? DEFAULT_SETTINGS.generator_temperature,
      generator_system_prompt: data?.generator_system_prompt ?? DEFAULT_SETTINGS.generator_system_prompt,
      question_generator_temperature: data?.question_generator_temperature ?? DEFAULT_SETTINGS.question_generator_temperature,
      refinement_temperature: data?.refinement_temperature ?? DEFAULT_SETTINGS.refinement_temperature,
      script_analyzer_temperature: data?.script_analyzer_temperature ?? DEFAULT_SETTINGS.script_analyzer_temperature,
      critic_temperature: data?.critic_temperature ?? DEFAULT_SETTINGS.critic_temperature,
      critic_system_prompt: data?.critic_system_prompt ?? DEFAULT_SETTINGS.critic_system_prompt,
      pattern_extractor_temperature: data?.pattern_extractor_temperature ?? DEFAULT_SETTINGS.pattern_extractor_temperature,
      pattern_extractor_system_prompt: data?.pattern_extractor_system_prompt ?? DEFAULT_SETTINGS.pattern_extractor_system_prompt,
      placeholder_analyzer_temperature: data?.placeholder_analyzer_temperature ?? DEFAULT_SETTINGS.placeholder_analyzer_temperature,
      placeholder_analyzer_system_prompt: data?.placeholder_analyzer_system_prompt ?? DEFAULT_SETTINGS.placeholder_analyzer_system_prompt,
      metadata_assessor_temperature: data?.metadata_assessor_temperature ?? DEFAULT_SETTINGS.metadata_assessor_temperature,
      metadata_assessor_system_prompt: data?.metadata_assessor_system_prompt ?? DEFAULT_SETTINGS.metadata_assessor_system_prompt,
    };

    // Cache the result
    settingsCache.set(userId, { settings, timestamp: Date.now() });

    console.log(`[getPromptFactorySettings] Loaded settings for user ${userId}:`, {
      generator_temp: settings.generator_temperature,
      question_temp: settings.question_generator_temperature,
      refinement_temp: settings.refinement_temperature,
      script_analyzer_temp: settings.script_analyzer_temperature,
      critic_temp: settings.critic_temperature,
      pattern_extractor_temp: settings.pattern_extractor_temperature,
      placeholder_analyzer_temp: settings.placeholder_analyzer_temperature,
      metadata_assessor_temp: settings.metadata_assessor_temperature,
      custom_prompts: {
        generator: settings.generator_system_prompt ? "YES" : "NO",
        critic: settings.critic_system_prompt ? "YES" : "NO",
        pattern_extractor: settings.pattern_extractor_system_prompt ? "YES" : "NO",
        placeholder_analyzer: settings.placeholder_analyzer_system_prompt ? "YES" : "NO",
        metadata_assessor: settings.metadata_assessor_system_prompt ? "YES" : "NO",
      },
    });

    return settings;
  } catch (error: any) {
    console.error(`[getPromptFactorySettings] Error: ${error.message}, using defaults`);
    return DEFAULT_SETTINGS;
  }
}

/**
 * ============================================================================
 * GENERATOR LLM - Conversational Prompt Generation
 * ============================================================================
 */

/**
 * Assess quality and specificity of extracted metadata
 */
export async function assessMetadataQuality(
  metadata: GenerationMetadata,
  conversation: Message[],
  userId?: string
): Promise<EnhancedMetadata> {
  // Fetch settings if userId provided
  const settings = userId ? await getPromptFactorySettings(userId) : DEFAULT_SETTINGS;

  const conversationText = conversation
    .slice(-6) // Last 6 messages for context
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const conversationAndMetadata = `RECENT CONVERSATION:
${conversationText}

EXTRACTED METADATA:
- lead_type: "${metadata.lead_type || 'MISSING'}"
- primary_goal: "${metadata.primary_goal || 'MISSING'}"
- audience: "${metadata.audience || 'MISSING'}"`;

  // Use custom system prompt if available, otherwise use default
  const systemPrompt = settings.metadata_assessor_system_prompt || DEFAULT_METADATA_ASSESSOR_PROMPT;
  const fullPrompt = systemPrompt.replace("{{CONVERSATION_AND_METADATA}}", conversationAndMetadata);

  try {
    const result = await LLM.generateJSON(fullPrompt, {
      temperature: settings.metadata_assessor_temperature
    });

    // Add tracking metadata
    result.last_extracted_at = new Date().toISOString();
    result.at_message_count = conversation.length;
    result.extraction_count = 1;

    return result as EnhancedMetadata;
  } catch (error) {
    console.error("Failed to assess metadata quality:", error);

    // Fallback: create low-confidence fields
    return {
      lead_type: {
        value: metadata.lead_type || "UNKNOWN",
        confidence: metadata.lead_type ? 0.3 : 0.0,
        reasoning: "Extraction failed, using fallback",
        needs_clarification: true
      },
      primary_goal: {
        value: metadata.primary_goal || "UNKNOWN",
        confidence: metadata.primary_goal ? 0.3 : 0.0,
        reasoning: "Extraction failed, using fallback",
        needs_clarification: true
      },
      audience: {
        value: metadata.audience || "UNKNOWN",
        confidence: metadata.audience ? 0.3 : 0.0,
        reasoning: "Extraction failed, using fallback",
        needs_clarification: true
      },
      overall_confidence: 0.2,
      conversation_summary: "Unable to assess quality",
      last_extracted_at: new Date().toISOString(),
      at_message_count: conversation.length,
      extraction_count: 1
    };
  }
}

/**
 * Generation decision based on confidence scores
 */
export interface GenerationDecision {
  should_generate: boolean;
  reason: string;
  recommended_action?: "ask_next_question" | "clarify_specific_fields" | "ask_targeted_question";
  questions_asked: number;
  target_field?: "lead_type" | "primary_goal" | "audience";
}

/**
 * Decide whether to generate prompts or ask more questions
 */
export function decideNextAction(
  enhanced: EnhancedMetadata,
  questionsAsked: number
): GenerationDecision {
  const overall = enhanced.overall_confidence;

  // High confidence - generate!
  if (overall >= 0.75) {
    return {
      should_generate: true,
      reason: "High confidence in all required fields",
      questions_asked: questionsAsked
    };
  }

  // Early stage - keep asking
  if (questionsAsked < 3) {
    return {
      should_generate: false,
      reason: "Still gathering information",
      recommended_action: "ask_next_question",
      questions_asked: questionsAsked
    };
  }

  // Mid-stage with low confidence - targeted clarification
  if (questionsAsked >= 3 && questionsAsked < 6 && overall < 0.7) {
    // Find lowest confidence field that needs clarification
    const fields = [
      { name: "lead_type" as const, data: enhanced.lead_type },
      { name: "primary_goal" as const, data: enhanced.primary_goal },
      { name: "audience" as const, data: enhanced.audience }
    ].filter(f => f.data.needs_clarification)
     .sort((a, b) => a.data.confidence - b.data.confidence);

    if (fields.length > 0) {
      return {
        should_generate: false,
        reason: `Low confidence in: ${fields[0].name} (${fields[0].data.confidence})`,
        recommended_action: "clarify_specific_fields",
        questions_asked: questionsAsked,
        target_field: fields[0].name
      };
    }
  }

  // Late stage - generate with best effort BUT require minimum viable confidence
  if (questionsAsked >= 6) {
    if (overall >= 0.4) {  // NEW: Minimum floor even at question limit
      return {
        should_generate: true,
        reason: "Reached question limit with acceptable confidence",
        questions_asked: questionsAsked
      };
    } else {
      // At 6 questions but still < 0.4 confidence - something's wrong
      return {
        should_generate: false,
        reason: "Insufficient confidence even after 6 questions - unable to extract clear requirements",
        recommended_action: "ask_targeted_question", // Try one more targeted question
        questions_asked: questionsAsked
      };
    }
  }

  // Medium confidence - ask one more targeted question
  if (overall >= 0.5 && overall < 0.75) {
    const fields = [
      { name: "lead_type" as const, data: enhanced.lead_type },
      { name: "primary_goal" as const, data: enhanced.primary_goal },
      { name: "audience" as const, data: enhanced.audience }
    ].sort((a, b) => a.data.confidence - b.data.confidence);

    return {
      should_generate: false,
      reason: "Medium confidence, one more clarification recommended",
      recommended_action: "ask_targeted_question",
      questions_asked: questionsAsked,
      target_field: fields[0].name
    };
  }

  // Fallback - low confidence, keep asking
  return {
    should_generate: false,
    reason: "Insufficient information",
    recommended_action: "ask_next_question",
    questions_asked: questionsAsked
  };
}

/**
 * Generate targeted question based on confidence scores
 */
export async function generateTargetedQuestion(
  conversation: Message[],
  enhanced: EnhancedMetadata,
  decision: GenerationDecision,
  userId?: string
): Promise<string> {
  // Fetch user settings (with caching)
  const settings = userId ? await getPromptFactorySettings(userId) : DEFAULT_SETTINGS;

  const recentConversation = conversation
    .slice(-4)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  // If we have a specific target field, ask about it
  if (decision.target_field) {
    const targetField = enhanced[decision.target_field];

    const fieldContext = {
      lead_type: {
        name: "lead type",
        examples: [
          "Are these cold leads, warm referrals, or inbound inquiries?",
          "What specific situation are these leads in (foreclosure, divorce, inherited property)?"
        ]
      },
      primary_goal: {
        name: "primary goal",
        examples: [
          "Should the AI book appointments, just qualify them, or close sales?",
          "What specific action should happen at the end of successful calls?"
        ]
      },
      audience: {
        name: "target audience",
        examples: [
          "What's the typical situation these leads are in?",
          "Are they business owners, homeowners, or investors?"
        ]
      }
    };

    const context = fieldContext[decision.target_field];

    const prompt = `Generate a SHORT targeted question to clarify this field:

Field: ${context.name}
Current value: "${targetField.value}"
Confidence: ${targetField.confidence}
Why low: ${targetField.reasoning}

Recent conversation:
${recentConversation}

Generate ONE specific question (1 sentence) to improve this field.
Example questions for this field:
${context.examples.map(ex => `- ${ex}`).join('\n')}

Return only the question, no preamble.`;

    return await LLM.generate(prompt, { temperature: settings.question_generator_temperature });
  }

  // Otherwise, ask a general next question
  const prompt = `You are helping create an AI voice sales agent. Based on this conversation:

${recentConversation}

Current understanding:
- Lead type: ${enhanced.lead_type.value} (confidence: ${enhanced.lead_type.confidence})
- Primary goal: ${enhanced.primary_goal.value} (confidence: ${enhanced.primary_goal.confidence})
- Audience: ${enhanced.audience.value} (confidence: ${enhanced.audience.confidence})

Generate ONE SHORT follow-up question to improve our understanding.
Focus on the field with lowest confidence.
Keep it brief (1 sentence max).

Return only the question text, no preamble.`;

  return await LLM.generate(prompt, { temperature: settings.question_generator_temperature });
}

/**
 * DEPRECATED: Use generateTargetedQuestion() instead
 * Generate next question for the conversational flow
 */
export async function generateNextQuestion(
  conversation: Message[],
  metadata: GenerationMetadata
): Promise<string> {
  // Fallback to simple question generation
  const userMessageCount = conversation.filter(m => m.role === "user").length;

  if (userMessageCount >= 3) {
    return "I have enough information. Ready to generate prompts!";
  }

  const needed: string[] = [];
  if (!metadata.lead_type) needed.push("lead type");
  if (!metadata.primary_goal) needed.push("primary goal");
  if (!metadata.audience) needed.push("target audience");

  if (needed.length === 0) {
    return "I have enough information. Ready to generate prompts!";
  }

  const conversationText = conversation
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const prompt = `You are helping create an AI voice sales agent. Based on this conversation:

${conversationText}

Still need: ${needed.join(", ")}

Generate ONE SHORT follow-up question.
Keep it brief (1 sentence max).

Return only the question text, no preamble.`;

  return await LLM.generate(prompt);
}

/**
 * Generate agent prompts from collected conversation data
 */
export async function generateAgentPrompts(
  metadata: GenerationMetadata,
  ragContext: string,
  retryAttempt: number = 0
): Promise<{
  base_prompt: string;
  states: Array<{
    name: string;
    state_prompt: string;
    edges: Array<{ description: string; destination_state_name: string; speak_during_transition: boolean }>;
    tools?: unknown[];
  }>;
}> {
  const ragSection = ragContext.trim().length > 0
    ? `\n\n## LEARNED PATTERNS FROM KNOWLEDGE BASE:\n${ragContext}`
    : "\n\n## LEARNED PATTERNS:\n(No relevant patterns found in Knowledge Base yet - this will improve as more agents are created)";

  const placeholderGuidance = getPlaceholderGuidance();

  // Add retry-specific warning if this is a retry attempt
  const retryWarning = retryAttempt > 0
    ? `\n\n⚠️ CRITICAL: Your previous generation was rejected because it contained tags or placeholder text instead of full prompt content. Generate complete, detailed prompt content this time.\n\n`
    : '';

  const prompt = `You are an expert at creating AI voice sales agent prompts.

Your goal is to create natural, conversational, and effective prompts based on the patterns and examples provided from the Knowledge Base.

${placeholderGuidance}

## RELEVANT PATTERNS & EXAMPLES FROM KNOWLEDGE BASE:
${ragSection.trim().length > 0 ? ragSection : "Note: Patterns and examples will be retrieved from the Knowledge Base based on the agent type."}

## AGENT YOU'RE CREATING:
${JSON.stringify(metadata, null, 2)}

${retryWarning}## OUTPUT:

Generate a comprehensive base_prompt and two state prompts (warm_intro and schedule_meet).

CRITICAL: Generate full, detailed prompt content - not tags, summaries, or placeholder text like "detailed instructions here...".
Focus on creating prompts that sound natural and human, not robotic or scripted.

Your output should include:
- base_prompt: The main system prompt defining the agent's identity, personality, and behavioral guidelines
- warm_intro: The prompt for the initial conversation and qualifying phase
- schedule_meet: The prompt for booking appointments and next steps

Return ONLY valid JSON (no markdown):
{
  "base_prompt": "Complete system prompt content here...",
  "states": [
    {
      "name": "warm_intro",
      "state_prompt": "Complete warm_intro prompt content here...",
      "edges": [{"description": "Lead shows interest and is ready to schedule", "destination_state_name": "schedule_meet", "speak_during_transition": false}],
      "tools": [{"name": "end_call", "type": "end_call", "description": "End the call when lead opts out or is not interested"}]
    },
    {
      "name": "schedule_meet",
      "state_prompt": "Complete schedule_meet prompt content here...",
      "edges": [],
      "tools": [
        {"name": "check_availability", "type": "check_availability", "description": "Check if a time slot is available"},
        {"name": "book_appointment", "type": "book_appointment", "description": "Book the confirmed appointment"},
        {"name": "end_call", "type": "end_call", "description": "End call after successful booking"}
      ]
    }
  ]
}`;

  console.log(`[generateAgentPrompts] Attempt ${retryAttempt + 1}, Prompt length: ${prompt.length} chars`);

  const result = await LLM.generateJSON(prompt, { maxTokens: 6144 });

  // Validate structure
  if (!result.base_prompt || !Array.isArray(result.states)) {
    throw new Error("Generated prompts missing required fields");
  }

  // Validate that state_prompts are actually complete (detect quality issues, not arbitrary limits)
  const invalidStates: string[] = [];
  for (const state of result.states) {
    const content = state.state_prompt || '';

    // QUALITY CHECKS (not arbitrary limits)
    const isTooShort = content.length < 50; // Clearly just a tag
    const hasRepeatedPatterns = /(.{50,})\1{2,}/.test(content); // Same 50+ char chunk repeated 3+ times
    const hasExcessiveNewlines = (content.match(/\n/g) || []).length > 100; // More than 100 lines suggests structure issue
    const isPlaceholder = /\b(detailed instructions|complete prompt|FULL|here\.\.\.)\b/i.test(content);

    // LOG WARNING for unusually long (but don't block - feedback loop will teach optimal length)
    if (content.length > 3000) {
      console.warn(`[generateAgentPrompts] ${state.name} is ${content.length} chars (unusually long - may benefit from feedback refinement)`);
    }

    // BLOCK only if clearly malformed
    if (!state.state_prompt || isTooShort || hasRepeatedPatterns || hasExcessiveNewlines || isPlaceholder) {
      const issues = [
        isTooShort && 'TOO SHORT',
        hasRepeatedPatterns && 'REPEATED PATTERNS',
        hasExcessiveNewlines && 'EXCESSIVE STRUCTURE',
        isPlaceholder && 'PLACEHOLDER TEXT'
      ].filter(Boolean).join(', ');

      invalidStates.push(`${state.name} (${content.length} chars: ${issues})`);
      console.warn(`[generateAgentPrompts] state_prompt for ${state.name} appears invalid: ${issues}`);
    }
  }

  // If validation failed and we haven't exhausted retries, try again
  if (invalidStates.length > 0 && retryAttempt < 2) {
    console.warn(`[generateAgentPrompts] Retrying due to invalid state_prompts: ${invalidStates.join(", ")}`);
    return generateAgentPrompts(metadata, ragContext, retryAttempt + 1);
  }

  // If still failing after retries, throw detailed error
  if (invalidStates.length > 0) {
    throw new Error(
      `Failed to generate valid state_prompts after ${retryAttempt + 1} attempts. ` +
      `Invalid states: ${invalidStates.join(", ")}. ` +
      `State prompts must contain actual content, not tags or placeholder text.`
    );
  }

  console.log(`[generateAgentPrompts] Success! Generated base_prompt (${result.base_prompt.length} chars) and ${result.states.length} states`);
  for (const state of result.states) {
    console.log(`  - ${state.name}: ${state.state_prompt.length} chars`);
  }

  return result as {
    base_prompt: string;
    states: Array<{
      name: string;
      state_prompt: string;
      edges: Array<{ description: string; destination_state_name: string; speak_during_transition: boolean }>;
      tools?: unknown[];
    }>;
  };
}

/**
 * ============================================================================
 * CRITIC LLM - Transcript Analysis & Feedback
 * ============================================================================
 */

// Default system prompt for Critic LLM
const DEFAULT_CRITIC_PROMPT = `Analyze this AI voice sales agent call transcript:

{{TRANSCRIPT}}

Evaluate the following dimensions:

1. **Verbosity** - Response length per turn (count sentences)
   - 1 = Too brief/abrupt
   - 3 = Perfect (1-2 sentences)
   - 5 = Too verbose/overwhelming

2. **Closing Effectiveness** - How well agent moved toward goal
   - Count closing attempts
   - Rate success: 1 (weak) to 5 (excellent)

3. **Objection Handling** - Response to resistance
   - Quality: 1 (poor) to 5 (excellent)
   - Did agent acknowledge, address, and advance?

4. **Unnatural Phrases** - Robotic/scripted language
   - List specific phrases that sound artificial

5. **Specific Issues** - Problems that hurt performance
   - Be concrete and actionable

6. **Strengths** - What the agent did well
   - Highlight effective techniques

7. **Improvement Suggestions** - Specific, actionable fixes
   - Focus on highest impact changes

8. **Prompt Structure Issues** - Meta-analysis (NEW)
   - Does transcript suggest prompt is too prescriptive/robotic?
   - Evidence of forced phrases or unnatural patterns repeated?
   - Signs agent is following a rigid script vs adapting naturally?
   - Does agent sound like executing numbered steps mechanically?
   - Identify specific behaviors suggesting structural prompt problems

Return ONLY valid JSON:
{
  "verbosity_score": 3,
  "avg_sentences_per_turn": 1.8,
  "closing_effectiveness": 4,
  "closing_attempts": 3,
  "objection_handling_quality": 3,
  "unnatural_phrases": ["phrase1", "phrase2"],
  "specific_issues": ["issue1", "issue2"],
  "strengths": ["strength1", "strength2"],
  "improvement_suggestions": ["suggestion1", "suggestion2"],
  "prompt_structure_issues": ["issue1", "issue2"]
}`;

export interface TranscriptAnalysis {
  verbosity_score: number; // 1-5 (1=too brief, 3=perfect, 5=too verbose)
  avg_sentences_per_turn: number;
  closing_effectiveness: number; // 1-5
  closing_attempts: number;
  objection_handling_quality: number; // 1-5
  unnatural_phrases: string[];
  specific_issues: string[];
  strengths: string[];
  improvement_suggestions: string[];
  prompt_structure_issues: string[]; // NEW: Detects if prompt structure is causing problems
}

/**
 * Analyze a call transcript using Critic LLM
 */
export async function analyzeTranscript(
  transcript: string,
  user_rating: number,
  user_notes?: string,
  userId?: string
): Promise<TranscriptAnalysis> {
  // Fetch settings if userId provided
  const settings = userId ? await getPromptFactorySettings(userId) : DEFAULT_SETTINGS;

  const userFeedback = user_notes ? `\n\nUser feedback (${user_rating}/5 stars): ${user_notes}` : "";

  // Use custom system prompt if available, otherwise use default
  const systemPrompt = settings.critic_system_prompt || DEFAULT_CRITIC_PROMPT;
  const fullPrompt = systemPrompt.replace("{{TRANSCRIPT}}", `${transcript}${userFeedback}`);

  return await LLM.generateJSON(fullPrompt, {
    temperature: settings.critic_temperature
  }) as TranscriptAnalysis;
}

/**
 * ============================================================================
 * SCRIPT ANALYZER LLM - Conversational Flow Analysis
 * ============================================================================
 */

export interface ConversationalFlowAnalysis {
  structure_type: 'flow_based' | 'numbered_steps' | 'mixed';
  avg_sentence_length: number;
  tone_register: string; // "formal", "casual", "consultative", "direct"
  question_to_statement_ratio: number; // e.g., 0.5 = 1 question per 2 statements
  turn_taking_cadence: string; // "rapid", "spacious", "balanced"
  transition_style: string; // e.g., "smooth and natural", "abrupt", "question-based"
  objection_handling_approach: string; // e.g., "acknowledge and redirect", "direct rebuttal"
  opening_closing_energy: string; // e.g., "warm opening, urgent close", "consistent throughout"
  linguistic_patterns: string[]; // Positive patterns to emulate (NOT specific phrases)
  sections_detected: string[]; // Flow sections found (e.g., "opening", "qualification", "close")
  confidence: number; // 0-1 score on analysis quality
  analysis_notes: string; // Overall insights
}

/**
 * Analyze example conversation scripts to understand style and structure patterns
 *
 * IMPORTANT: This analyzes HOW conversations flow, NOT what content to copy.
 * Used to guide the Generator LLM's style, tone, and structural approach.
 *
 * @param exampleScripts Array of 1-5 example conversation scripts
 * @param metadata Agent metadata for context
 * @param userId User ID for fetching temperature settings
 * @returns Structured analysis of conversational patterns
 */
export async function analyzeConversationalFlow(
  exampleScripts: string[],
  metadata: GenerationMetadata,
  userId?: string
): Promise<ConversationalFlowAnalysis> {
  // Fetch user settings (with caching)
  const settings = userId ? await getPromptFactorySettings(userId) : DEFAULT_SETTINGS;

  // Combine scripts for analysis
  const combinedScripts = exampleScripts.join("\n\n---SCRIPT DIVIDER---\n\n");

  console.log(`[analyzeConversationalFlow] Analyzing ${exampleScripts.length} scripts (${combinedScripts.length} chars total), Temperature: ${settings.script_analyzer_temperature}`);

  const prompt = `Analyze these example conversation scripts to understand their STYLE and STRUCTURE patterns:

${combinedScripts}

CONTEXT: Creating AI agent for:
- Lead type: ${metadata.lead_type || 'unknown'}
- Primary goal: ${metadata.primary_goal || 'unknown'}
- Audience: ${metadata.audience || 'unknown'}

IMPORTANT: Analyze HOW these conversations flow, NOT what specific content to copy.

## Analysis Dimensions:

1. **Structure Type**
   - flow_based: Organized by phases (opening, discovery, close) with adaptive transitions
   - numbered_steps: Follows rigid procedural steps (1. 2. 3.)
   - mixed: Combination of both

2. **Average Sentence Length**
   - Count typical sentences per agent response
   - Note if varies by conversation phase

3. **Tone Register**
   - formal: Professional, business language
   - casual: Conversational, friendly
   - consultative: Expert advisor positioning
   - direct: Brief, to-the-point

4. **Question to Statement Ratio**
   - Calculate approximate ratio (e.g., 0.5 = 1 question per 2 statements)

5. **Turn-Taking Cadence**
   - rapid: Quick back-and-forth exchanges
   - spacious: Longer responses with pauses
   - balanced: Mix of short and longer turns

6. **Transition Style**
   - How does conversation move between phases?
   - Smooth/natural, question-based, acknowledgment-based, abrupt?

7. **Objection Handling Approach**
   - How are objections addressed?
   - Acknowledge and redirect? Direct rebuttal? Empathy first?

8. **Opening/Closing Energy**
   - Does tone/urgency shift between beginning and end?
   - Examples: "warm opening, urgent close", "consistent throughout"

9. **Linguistic Patterns to EMULATE**
   - What makes this conversation feel natural?
   - Types of phrases/patterns that work well (NOT specific words to copy)
   - Examples: "uses curiosity-driven questions", "acknowledges before redirecting", "avoids jargon"

10. **Sections Detected**
    - What flow phases are present? (opening, rapport, qualification, objection handling, close)

11. **Analysis Confidence**
    - 0.0-0.4: Insufficient data or unclear patterns
    - 0.5-0.7: Some patterns identified, needs more examples
    - 0.8-1.0: Clear, consistent patterns across scripts

12. **Overall Insights**
    - 2-3 sentences summarizing key takeaways
    - What makes this conversational style effective?

Return ONLY valid JSON:
{
  "structure_type": "flow_based",
  "avg_sentence_length": 2.5,
  "tone_register": "consultative",
  "question_to_statement_ratio": 0.4,
  "turn_taking_cadence": "balanced",
  "transition_style": "question-based with acknowledgment",
  "objection_handling_approach": "acknowledge, empathize, redirect with value",
  "opening_closing_energy": "warm and curious opening, confident but not pushy close",
  "linguistic_patterns": ["uses curiosity-driven questions", "acknowledges before redirecting", "mirrors prospect language"],
  "sections_detected": ["opening", "qualification", "value proposition", "objection handling", "close"],
  "confidence": 0.85,
  "analysis_notes": "Scripts show adaptive flow with natural transitions. Agent asks questions to guide conversation rather than following rigid script. Maintains consultative tone throughout."
}`;

  try {
    const result = await LLM.generateJSON(prompt, {
      maxTokens: 2048,
      temperature: settings.script_analyzer_temperature
    });

    console.log(`[analyzeConversationalFlow] Analysis complete: ${result.structure_type} structure, ${result.confidence} confidence`);
    console.log(`[analyzeConversationalFlow] Sections detected: ${result.sections_detected?.join(", ")}`);
    if (result.linguistic_patterns?.length > 0) {
      console.log(`[analyzeConversationalFlow] Linguistic patterns: ${result.linguistic_patterns.join(", ")}`);
    }

    return result as ConversationalFlowAnalysis;
  } catch (error: any) {
    console.error(`[analyzeConversationalFlow] Analysis failed: ${error.message}`);

    // Fallback: return low-confidence default analysis
    return {
      structure_type: 'mixed',
      avg_sentence_length: 2.0,
      tone_register: 'consultative',
      question_to_statement_ratio: 0.5,
      turn_taking_cadence: 'balanced',
      transition_style: 'unknown - analysis failed',
      objection_handling_approach: 'unknown - analysis failed',
      opening_closing_energy: 'unknown - analysis failed',
      linguistic_patterns: [],
      sections_detected: ['opening', 'qualification', 'close'],
      confidence: 0.0,
      analysis_notes: `Analysis failed: ${error.message}. Using fallback defaults.`
    };
  }
}

/**
 * ============================================================================
 * PATTERN EXTRACTOR LLM - Learning from Evaluations
 * ============================================================================
 */

// Default system prompt for Pattern Extractor LLM
const DEFAULT_PATTERN_EXTRACTOR_PROMPT = `Extract learnable patterns from this AI agent evaluation:

{{EVALUATION_DATA}}

Identify 1-3 patterns that should inform future prompt generations:

Pattern Types:
- best_practice: Techniques that worked well
- anti_pattern: Things to avoid
- closing_technique: Effective closing strategies
- objection_handling: How to handle specific objections
- verbosity_rule: Response length guidelines
- tone_guidance: Tone/style recommendations
- conversation_flow: Structural improvements
- prompt_structure: Structural issues with prompt itself (NEW)
  * Use when agent sounds mechanical/robotic due to prompt structure
  * Examples: numbered steps causing rigid execution, too many overlapping rules, pre-scripted phrases

For each pattern, provide:
- pattern_type: One of the above
- agent_type_category: "cold_call", "warm_lead", or "all"
- pattern_summary: One sentence summary
- pattern_details: 2-4 sentences with specific guidance

Return ONLY valid JSON array:
[
  {
    "pattern_type": "anti_pattern",
    "agent_type_category": "cold_call",
    "pattern_summary": "Avoid verbose opening responses in cold calls",
    "pattern_details": "Analysis of 5 transcripts shows that opening responses longer than 2 sentences reduce engagement. Prospects in cold call scenarios prefer quick, direct questions over lengthy introductions."
  }
]`;

export interface ExtractedPattern {
  pattern_type: string;
  agent_type_category?: string;
  pattern_summary: string;
  pattern_details: string;
}

/**
 * Extract learnable patterns from evaluation
 */
export async function extractLearningPatterns(
  evaluation: {
    transcript: string;
    user_rating: number;
    user_notes?: string;
    automated_analysis: TranscriptAnalysis;
  },
  agent_context?: {
    agent_type?: string;
    category?: string;
  },
  userId?: string
): Promise<ExtractedPattern[]> {
  // Fetch settings if userId provided
  const settings = userId ? await getPromptFactorySettings(userId) : DEFAULT_SETTINGS;

  const evaluationData = `Rating: ${evaluation.user_rating}/5
User Notes: ${evaluation.user_notes || "None"}
Analysis: ${JSON.stringify(evaluation.automated_analysis, null, 2)}
Agent Context: ${agent_context ? JSON.stringify(agent_context) : "Not provided"}`;

  // Use custom system prompt if available, otherwise use default
  const systemPrompt = settings.pattern_extractor_system_prompt || DEFAULT_PATTERN_EXTRACTOR_PROMPT;
  const fullPrompt = systemPrompt.replace("{{EVALUATION_DATA}}", evaluationData);

  const result = await LLM.generateJSON(fullPrompt, {
    temperature: settings.pattern_extractor_temperature
  });

  if (!Array.isArray(result)) {
    throw new Error("Pattern extraction did not return an array");
  }

  return result as ExtractedPattern[];
}

/**
 * ============================================================================
 * PLACEHOLDER ANALYZER LLM - Auto-Suggest Placeholders
 * ============================================================================
 */

// Default system prompt for Placeholder Analyzer LLM
const DEFAULT_PLACEHOLDER_ANALYZER_PROMPT = `Analyze these finalized AI agent prompts to identify user-customizable placeholders:

{{PROMPT_DATA}}

Identify placeholders for:
1. Names (agent name, company name, expert name, etc.)
2. Timeframes (closing time, offer delivery, etc.)
3. Values/numbers (years in business, properties purchased, etc.)
4. Customizable copy (value propositions, specialties, etc.)

Also identify conversation flow instructions users should be able to edit:
- Opening approach
- Permission check language
- Objection responses
- Closing language

BALANCE: Target 8-12 placeholders total. Not overwhelming for non-technical users.

Return ONLY valid JSON:
{
  "suggested_placeholders": [
    {
      "semantic_key": "agent_name",
      "token": "{AIAgentName}",
      "description": "Name the AI uses to introduce itself",
      "frontend_label": "AI Agent Name",
      "required": true,
      "default_value": "Sarah"
    }
  ],
  "suggested_editable_guidelines": [
    {
      "semantic_key": "intro_approach",
      "location": "warm_intro step 2",
      "description": "How to open the call after confirming contact",
      "placeholder_token": "{IntroductionLine}",
      "default_instruction": "State your name and ask if they're open to a cash offer"
    }
  ]
}`;

export interface PlaceholderSuggestion {
  semantic_key: string;
  token: string;
  description: string;
  frontend_label: string;
  required: boolean;
  default_value?: string;
}

export interface EditableGuidelineSuggestion {
  semantic_key: string;
  location: string; // e.g., "warm_intro step 2"
  description: string;
  placeholder_token: string;
  default_instruction: string;
}

/**
 * Analyze prompts and suggest placeholders for user customization
 */
export async function suggestPlaceholders(
  base_prompt: string,
  states: unknown[],
  userId?: string
): Promise<{
  suggested_placeholders: PlaceholderSuggestion[];
  suggested_editable_guidelines: EditableGuidelineSuggestion[];
}> {
  // Fetch settings if userId provided
  const settings = userId ? await getPromptFactorySettings(userId) : DEFAULT_SETTINGS;

  const promptData = `BASE PROMPT:
${base_prompt}

STATES:
${JSON.stringify(states, null, 2)}`;

  // Use custom system prompt if available, otherwise use default
  const systemPrompt = settings.placeholder_analyzer_system_prompt || DEFAULT_PLACEHOLDER_ANALYZER_PROMPT;
  const fullPrompt = systemPrompt.replace("{{PROMPT_DATA}}", promptData);

  return await LLM.generateJSON(fullPrompt, {
    temperature: settings.placeholder_analyzer_temperature
  }) as {
    suggested_placeholders: PlaceholderSuggestion[];
    suggested_editable_guidelines: EditableGuidelineSuggestion[];
  };
}

/**
 * ============================================================================
 * REFINEMENT LLM - Improve Prompts Based on Feedback
 * ============================================================================
 */

/**
 * Generate improved prompts based on evaluation feedback
 */
export async function refinePromptsWithFeedback(
  original_base_prompt: string,
  original_states: unknown[],
  evaluation: {
    transcript: string;
    user_rating: number;
    user_notes?: string;
    automated_analysis: TranscriptAnalysis;
    improvement_suggestions: string[];
  },
  ragContext: string,
  userId?: string
): Promise<{
  base_prompt: string;
  states: unknown[];
  changes_summary: string;
}> {
  // Fetch user settings (with caching)
  const settings = userId ? await getPromptFactorySettings(userId) : DEFAULT_SETTINGS;

  const ragSection = ragContext.trim().length > 0
    ? `\n\nRELEVANT IMPROVEMENT PATTERNS:\n${ragContext}`
    : "";

  const prompt = `Improve these AI agent prompts based on feedback:

ORIGINAL BASE PROMPT:
${original_base_prompt}

ORIGINAL STATES:
${JSON.stringify(original_states, null, 2)}

EVALUATION:
Rating: ${evaluation.user_rating}/5
User Notes: ${evaluation.user_notes || "None"}
Automated Analysis: ${JSON.stringify(evaluation.automated_analysis, null, 2)}
Improvement Suggestions: ${evaluation.improvement_suggestions.join("; ")}${ragSection}

Generate IMPROVED versions that address the feedback while maintaining structure.

## CRITICAL REFINEMENT PRINCIPLES:

### Consider SIMPLIFICATION, Not Just Addition
- If verbosity is an issue, check if the PROMPT itself is verbose
- Can you DELETE or COMBINE overlapping instruction sections?
- Are there contradictory rules that should be removed?
- Is the prompt telling the agent to "be concise" while being verbose itself?

### Structural Improvements
- Replace numbered procedural steps with flow-based guidance
- Consolidate redundant sections (Closing Mindset + Call Control + Conversation Control → single "Conversation Strategy")
- Remove pre-scripted "power phrases" or "pattern interrupts"
- Eliminate literal percentages ("40% rapport, 60% closing")

### Ask Before Adding
- Before adding new instructions, ask: "Could I DELETE something instead?"
- Before adding a new section, ask: "Can this be combined with an existing section?"
- If agent is robotic, the solution is often SIMPLIFICATION, not more rules

### Key Focus Areas
- If verbosity_score > 3: Check if prompt has too many instructions or overlapping sections
- If closing_effectiveness < 3: Strengthen closing language BUT avoid adding rigid scripts
- If objection_handling < 3: Improve objection responses with adaptive guidance, not prescriptive escalation
- If prompt_structure_issues detected: Simplify structure, replace steps with flow-based sections
- Address specific issues mentioned
- Incorporate RAG patterns if provided

Return ONLY valid JSON:
{
  "base_prompt": "...",
  "states": [...],
  "changes_summary": "Brief description of key improvements made (mention what was DELETED or simplified, not just added)"
}`;

  console.log(`[refinePromptsWithFeedback] Using temperature: ${settings.refinement_temperature}`);

  return await LLM.generateJSON(prompt, { temperature: settings.refinement_temperature }) as {
    base_prompt: string;
    states: unknown[];
    changes_summary: string;
  };
}

/**
 * ============================================================================
 * MARKDOWN-BASED PROMPT GENERATION (New Format)
 * ============================================================================
 */

/**
 * Generate agent prompts in markdown format (instead of JSON)
 *
 * This is the new preferred format that produces human-readable markdown
 * which gets compiled to Retell format by the prompt-compiler.
 *
 * @param metadata Agent metadata
 * @param ragContexts Split RAG contexts (quality_principles, gold_examples, positive_patterns, anti_patterns)
 * @param userId User ID for fetching settings
 * @param flowAnalysis Optional conversational flow analysis from example scripts
 * @returns Markdown string with sections
 */
export async function generateAgentPromptsMarkdown(
  metadata: GenerationMetadata,
  ragContexts: Record<string, string>,
  userId?: string,
  flowAnalysis?: ConversationalFlowAnalysis
): Promise<string> {
  // Fetch user settings (with caching)
  const settings = userId ? await getPromptFactorySettings(userId) : DEFAULT_SETTINGS;

  const placeholderGuidance = getPlaceholderGuidance();

  // Use custom system prompt if provided, otherwise use default
  const systemPrompt = settings.generator_system_prompt || `You are an expert at creating AI voice sales agent prompts.

Your goal is to create natural, conversational, and effective prompts based on the patterns and examples provided from the Knowledge Base.`;

  // Build flow analysis section if provided
  let flowAnalysisSection = "";
  if (flowAnalysis && flowAnalysis.confidence >= 0.5) {
    flowAnalysisSection = `

## CONVERSATIONAL FLOW ANALYSIS FROM EXAMPLE SCRIPTS

The user provided example conversation scripts. Here's what we learned about their preferred conversational style:

**Structure Approach**: ${flowAnalysis.structure_type === 'flow_based' ? '✅ Flow-based (adaptive phases)' : flowAnalysis.structure_type === 'numbered_steps' ? '⚠️ Numbered steps (avoid this - use flow-based instead)' : 'Mixed approach'}

**Style Characteristics**:
- **Tone**: ${flowAnalysis.tone_register}
- **Sentence Length**: ${flowAnalysis.avg_sentence_length.toFixed(1)} sentences per turn on average
- **Question Ratio**: ${(flowAnalysis.question_to_statement_ratio * 100).toFixed(0)}% questions vs statements
- **Turn-Taking**: ${flowAnalysis.turn_taking_cadence} cadence
- **Transitions**: ${flowAnalysis.transition_style}

**Objection Handling**: ${flowAnalysis.objection_handling_approach}

**Energy Profile**: ${flowAnalysis.opening_closing_energy}

**Conversation Phases Detected**: ${flowAnalysis.sections_detected.join(", ")}

${flowAnalysis.linguistic_patterns && flowAnalysis.linguistic_patterns.length > 0 ? `**✅ Linguistic Patterns to Emulate**: ${flowAnalysis.linguistic_patterns.map(p => `"${p}"`).join(", ")}` : ""}

**Key Insight**: ${flowAnalysis.analysis_notes}

**IMPORTANT**: Use these insights to guide your STYLE and STRUCTURE approach. DO NOT copy specific content from the scripts. The goal is to match the conversational flow patterns while creating original content for this specific agent type.
`;

    console.log(`[generateAgentPromptsMarkdown] Including flow analysis: ${flowAnalysis.structure_type} structure, ${flowAnalysis.confidence} confidence`);
  } else if (flowAnalysis && flowAnalysis.confidence < 0.5) {
    console.log(`[generateAgentPromptsMarkdown] Flow analysis confidence too low (${flowAnalysis.confidence}), not including in prompt`);
  }

  // Build critical structural principles section
  const structuralPrinciples = `

## CRITICAL STRUCTURAL PRINCIPLES

Let's create a natural, adaptive prompt that enables genuine conversation and strategically hooks prospects.

### 1. Structure: Flow-Based, Not Numbered Steps

**CRITICAL**: Use flow-based sections instead of numbered steps. Flow-based prompts enable natural conversation while numbered steps cause mechanical execution.

❌ **AVOID (Mechanical Execution)**:
\`\`\`
1. Correct User Check - Ask if you are speaking to {{first_name}}
2. Quick Purpose Check - State your name and ask if they're open to a cash offer
3. If sold: Acknowledge and end call
\`\`\`

✅ **PREFER (Natural Flow)**:
\`\`\`
## Confirming Contact

Make sure you're speaking with the right person naturally - use their first name conversationally.

If it's not them, ask for the homeowner. If you can't reach them, wrap up politely.

## Opening Hook

Lead with your compelling value proposition immediately - don't introduce yourself or explain why you're calling first. You have one shot to get their attention before they hang up.
\`\`\`

**Key difference**: Flow-based sections describe WHAT TO ACCOMPLISH. Don't force a specific number of sections - adapt to what makes sense for this agent type.

---

### 2. Language: Sound Human, Not Like AI

**CRITICAL**: Teach the agent to sound like a real person, not a corporate robot.

❌ **AVOID (Robotic AI Phrases)**:
- "I understand your concern"
- "I appreciate your perspective"
- "Thank you for sharing that"
- "Let me provide you with..."

✅ **PREFER (Natural Human Speech)**:
- "Fair point"
- "Got it"
- "So let me ask you this..."
- "Real quick..."
- "Here's the thing..."

**Response Length**: **One sentence typically** - maybe 2 if absolutely necessary. Short, natural responses keep conversation flowing.

---

### 3. Strategic Hooks: Cut Through the Noise

**CRITICAL**: These agents are calling leads who get bombarded with calls daily. Generic openings get hung up on immediately. You have ONE chance to hook their attention.

❌ **AVOID (Generic, Expected Pitches)**:
- Announcing who you are before establishing interest
- Asking permission ("Would you be interested in...")
- Generic value props they've heard before
- Explaining your purpose upfront

**Why these fail**: Prospect immediately categorizes this as "another sales call" and hangs up.

✅ **PREFER (Pattern Interrupts & Compelling Hooks)**:

**Strategic principles**:
1. **Hook first, explain later** - Lead with a compelling question or assumption that creates curiosity
2. **Use assumptive framing** - "When would you..." not "Would you be interested in..."
3. **Skip the preamble** - Don't say "I'm calling because..." or "The reason for my call..."
4. **Pattern interrupt** - Say something unexpected that makes them pause and think
5. **Save unique angles for objection handling** - When they push back, THEN reveal your competitive advantage

**Teach the agent**:
- Open with outcome-focused questions that make them visualize the benefit
- Use time-bound specificity to add urgency and credibility
- Create curiosity gaps that make them want to hear more
- Handle objections by revealing the unique value proposition they weren't expecting

---

### Key Guidelines When Generating:

1. **Flow-based sections** - describe goals, not step-by-step procedures
2. **Flexible structure** - adapt to this specific agent type
3. **Natural speech** - casual, human language
4. **Brief responses** - one sentence is the norm
5. **Strategic hooks** - teach pattern interrupts and compelling opening questions
6. **Assumptive framing** - guide toward action, not permission

When you read the Knowledge Base examples below, extract PRINCIPLES about strategic communication, not just conversational flow. Transform any numbered steps into flow-based sections.
`;

  const prompt = `${systemPrompt}

${placeholderGuidance}
${structuralPrinciples}

${ragContexts.quality_principles || ""}

${ragContexts.gold_examples || ""}

${ragContexts.positive_patterns || ""}

${ragContexts.anti_patterns || ""}
${flowAnalysisSection}

## AGENT YOU'RE CREATING:
${JSON.stringify(metadata, null, 2)}

## OUTPUT FORMAT:

Generate your prompts in MARKDOWN format with H1 section headers:

# BASE_PROMPT
[Complete system prompt defining agent identity, personality, behavioral guidelines]

# WARM_INTRO
[Complete prompt for initial conversation and qualifying phase]

# SCHEDULE_MEET
[Complete prompt for booking appointments and next steps]

IMPORTANT: Generate FULL, DETAILED prompt content in each section - not tags, summaries, or placeholder text. Each section should be complete and ready to use.

Your prompt can be detailed to teach principles, but the resulting agent responses should be SHORT and natural. Detailed guidance enables concise execution.

Output ONLY the markdown sections (no code blocks, no JSON):`;

  console.log(`[generateAgentPromptsMarkdown] Prompt length: ${prompt.length} chars, Temp: ${settings.generator_temperature}, Custom prompt: ${settings.generator_system_prompt ? 'YES' : 'NO'}`);

  // Generate markdown (use text generation, not JSON) with user's temperature setting
  const markdown = await LLM.generate(prompt, {
    maxTokens: 8192,
    temperature: settings.generator_temperature
  });

  // Basic validation
  if (!markdown.includes('# BASE_PROMPT') && !markdown.includes('# Base Prompt')) {
    throw new Error('Generated markdown missing BASE_PROMPT section');
  }

  console.log(`[generateAgentPromptsMarkdown] Success! Generated ${markdown.length} chars of markdown`);

  return markdown;
}
