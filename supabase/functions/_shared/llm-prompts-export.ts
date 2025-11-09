/**
 * LLM Prompt Templates Export
 *
 * Centralized prompt templates used by llm-helpers.ts
 * Exposed via get-system-prompts edge function for frontend display
 *
 * This file is the single source of truth for all system prompts.
 * DO NOT duplicate these prompts in other files.
 */

/**
 * Generator LLM - Targeted Question Generation
 * Used when asking follow-up questions during metadata extraction
 */
export function getGeneratorQuestionPrompt(): string {
  return `You are helping create an AI voice sales agent. Based on this conversation:

{conversation_history}

Current understanding:
- Lead type: {lead_type} (confidence: {lead_type_confidence})
- Primary goal: {primary_goal} (confidence: {primary_goal_confidence})
- Audience: {audience} (confidence: {audience_confidence})

Generate ONE SHORT follow-up question to improve our understanding.
Focus on the field with lowest confidence.
Keep it brief (1 sentence max).

Return only the question text, no preamble.`;
}

/**
 * Generator LLM - Markdown Prompt Generation (NEW FORMAT)
 * Produces flow-based prompts with quality principles
 */
export function getGeneratorMarkdownPrompt(): string {
  return `You are an expert at creating AI voice sales agent prompts.

Your goal is to create natural, conversational, and effective prompts based on the patterns and examples provided from the Knowledge Base.

{placeholder_guidance}

{quality_principles}

{gold_examples}

{positive_patterns}

{anti_patterns}

## AGENT YOU'RE CREATING:
{metadata}

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
}

/**
 * Critic LLM - Transcript Analysis
 * Analyzes call performance including prompt structure issues
 */
export function getCriticPrompt(): string {
  return `Analyze this AI voice sales agent call transcript:

{transcript}
{user_feedback}

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
}

/**
 * Pattern Extractor LLM - Learning from Evaluations
 * Extracts reusable patterns for RAG KB
 */
export function getPatternExtractorPrompt(): string {
  return `Extract learnable patterns from this AI agent evaluation:

Rating: {user_rating}/5
User Notes: {user_notes}
Analysis: {automated_analysis}
Agent Context: {agent_context}

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
}

/**
 * Placeholder Analyzer LLM - Auto-Suggest Placeholders
 * Identifies user-customizable fields in generated prompts
 */
export function getPlaceholderAnalyzerPrompt(): string {
  return `Analyze these finalized AI agent prompts to identify user-customizable placeholders:

BASE PROMPT:
{base_prompt}

STATES:
{states}

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
}

/**
 * Refinement LLM - Iterative Improvement
 * Improves prompts based on feedback with emphasis on simplification
 */
export function getRefinementPrompt(): string {
  return `Improve these AI agent prompts based on feedback:

ORIGINAL BASE PROMPT:
{original_base_prompt}

ORIGINAL STATES:
{original_states}

EVALUATION:
Rating: {user_rating}/5
User Notes: {user_notes}
Automated Analysis: {automated_analysis}
Improvement Suggestions: {improvement_suggestions}

{rag_context_similar_improvements}

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
}
