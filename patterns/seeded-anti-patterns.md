# Seeded Anti-Patterns for AI Voice Agent Prompts

## Metadata
- **Document Type**: Anti-Pattern Library
- **Purpose**: Identify and warn against common prompt structure problems
- **Quality Level**: silver
- **Source**: manual_analysis
- **Agent Category**: all
- **Rating Impact**: 3
- **Created**: 2025-10-11
- **Last Updated**: 2025-10-11

---

## Overview

These anti-patterns were identified through analysis of existing "average" quality prompts (expired listing, wholesaler templates) that produce mechanical, robotic agent behavior. Each pattern includes:
- What the anti-pattern is
- Why it causes problems
- How to detect it
- What to do instead

---

## Anti-Pattern 1: Numbered Procedural Steps

### Description
Structuring conversation flow as numbered sequential steps (1, 2, 3) that the agent must execute in order.

### Example (WRONG)
```
## Initial Contact Flow
1. Correct User Check
   - Ask if you are speaking to {{first_name}}
   - If not correct user: ask if this is the owner
   - If still not correct user: apologize and hang up

2. Quick Purpose Check
   - State your name
   - Ask if they are open to receiving a cash offer
   - If sold: Acknowledge and end call
   - If not sold: Move to step 3

3. Pain Point Discovery
   - Ask about current property situation
   - Listen for distress signals
   - Identify motivation level
```

### Why This Fails
- **Mechanical execution**: Agent follows steps like a checklist, not a conversation
- **No adaptability**: Can't skip irrelevant steps or adjust based on responses
- **Robotic pacing**: Forces linear progression regardless of conversation flow
- **Unnatural transitions**: "Moving to step 3" thinking shows in output
- **Loss of context**: Agent treats each step independently instead of as unified conversation

### How to Detect
- Look for `1.`, `2.`, `3.` or `Step 1`, `Step 2` in state prompts
- Check for phrases like "move to step X" or "after completing step Y"
- See if flow branches use "If X, then go to step Y" logic

### What to Do Instead
Use **flow-based phases** that teach purpose:

```
## Opening Move
- Greet naturally and confirm you're speaking with the right person
- Ask if it's a good time to talk
- Keep tone warm and conversational

## Discovery Phase
- Ask what sparked their interest or situation
- Listen to their complete answer
- Ask ONE relevant follow-up about their core challenge
```

**Why this works**: Teaches the agent to understand the PURPOSE of each phase, enabling natural adaptation.

---

## Anti-Pattern 2: Multiple Overlapping Instruction Sections

### Description
Creating 5-7+ separate instruction sections with redundant or contradictory guidance (e.g., "Closing Mindset", "Call Control", "Conversation Control", "Style Guardrails", "Response Guidelines", "Power Phrases").

### Example (WRONG)
```
## Closing Mindset
- Focus on getting them to commit
- Use assumptive closes
- Allocate 60% of conversation to closing

## Call Control
- Maintain control of conversation direction
- Guide them toward scheduling
- Don't let them derail the call

## Conversation Control
- Ask one question at a time
- Wait for complete answers
- Keep responses brief

## Style Guardrails
- Sound natural and conversational
- Match their energy level
- Use humor strategically
```

### Why This Fails
- **Cognitive overload**: Agent can't prioritize between contradictory rules
- **Redundancy**: Same guidance repeated across sections
- **Contradiction**: "Sound natural" vs "Follow rigid closing structure"
- **Confusion**: Which rule applies when multiple sections conflict?
- **Verbose prompts**: More sections = longer prompts without added clarity

### How to Detect
- Count major instruction sections - if >4, likely overlapping
- Look for repeated concepts across sections
- Check for contradictions (e.g., "be natural" + "follow this script")
- See if sections have vague names like "Guidelines", "Guardrails", "Control"

### What to Do Instead
**Consolidate into ≤3 clear sections**:

1. **Identity & Core Principles** (who the agent is, fundamental behavior)
2. **Conversation Guidelines** (how to communicate naturally)
3. **State Mission** (specific goals for this conversation phase)

**Why this works**: Clear hierarchy, no redundancy, easy to prioritize.

---

## Anti-Pattern 3: Pre-Scripted "Power Phrases" or "Pattern Interrupts"

### Description
Providing exact phrases the agent should say in specific situations, treating the LLM like a phrase-substitution script runner.

### Example (WRONG)
```
## Power Phrases for Transitions
- "Based on what you're sharing..."
- "That's exactly why I reached out..."
- "While we're discussing this..."
- "Let's do this..."
- "Here's what I can do for you..."

## Pattern Interrupts for Objections
- "I totally understand, and that's actually why..."
- "You know what's interesting..."
- "Real quick before I lose you..."
- "Fair enough, can I ask you this..."
```

### Why This Fails
- **Robotic repetition**: Agent uses exact phrases multiple times
- **Canned responses**: Sounds scripted and unnatural
- **No variation**: Every call uses same phrases in same situations
- **Loss of adaptability**: Agent stops thinking, just matches patterns
- **Unnatural language**: Phrases may not fit conversation context

### How to Detect
- Look for sections titled "Power Phrases", "Scripts", "Say This"
- Check for quotation marks around suggested phrases
- See if same phrases appear in multiple anti-patterns examples

### What to Do Instead
**Teach transition strategy** without prescribing exact words:

```
## Handling Objections
When they express concerns:
- Acknowledge their specific concern directly
- Address the underlying worry, not just surface objection
- Check if your response helped before pushing again
- If needed, reframe from a different angle

Avoid:
- Pre-scripted "power phrases" that sound canned
- Saying "I understand" when you haven't demonstrated understanding
- Using the same transition phrases repeatedly
```

**Why this works**: Agent learns HOW to handle situations, generates natural language.

---

## Anti-Pattern 4: Literal Percentages or Rigid Metrics

### Description
Using exact percentages, counts, or metrics in instructions (e.g., "40% rapport, 60% closing", "exactly 1-2 sentences", "limit to two attempts").

### Example (WRONG)
```
## Conversation Balance
- Allocate 40% of conversation to rapport building
- Allocate 60% of conversation to closing
- Keep responses to exactly 1-2 sentences
- Limit closing attempts to maximum of three
- Ask no more than 5 questions total
```

### Why This Fails
- **Mechanical interpretation**: LLM tries to count sentences/attempts literally
- **Loss of flexibility**: Can't adapt to conversation needs
- **Unnatural constraints**: Real conversations don't follow exact percentages
- **Forced pacing**: May rush or drag conversation to hit metrics
- **Focus on counting**: Agent counts metrics instead of reading situation

### How to Detect
- Look for percentage signs (%) in instructions
- Check for phrases like "exactly", "limit to", "maximum of", "no more than"
- See if instructions specify precise counts or durations

### What to Do Instead
**Use natural guidance with ranges**:

```
## Response Length & Conversation Flow
- Keep responses SHORT: 2-3 sentences maximum in most cases
- Occasionally use single sentences for impact
- Build rapport early in conversation, then shift focus to scheduling
- If closing attempts aren't working, try different approach
- Only end call if they explicitly state they're not interested
```

**Why this works**: Provides guidance without rigid constraints, allows adaptation.

---

## Anti-Pattern 5: Telling Agent to "Sound Natural" Without Teaching How

### Description
Including aspirational instructions like "be natural", "use humor", "match their tone" without concrete guidance on how to achieve this.

### Example (WRONG)
```
## Style Guardrails
- Sound natural and conversational
- Match the user's tone and energy level
- Incorporate light humor where appropriate
- Use humor strategically to disarm resistance
- Be authentic and genuine
- Vary your communication style
```

### Why This Fails
- **No actionable guidance**: These are goals, not instructions
- **Vague aspirations**: What does "strategic humor" actually mean?
- **Can't execute**: LLM doesn't know HOW to match tone
- **False confidence**: Makes you think you addressed naturalness
- **Padding**: Takes up space without adding value

### How to Detect
- Look for phrases like "sound natural", "be authentic", "use humor"
- Check for words like "strategically", "appropriately", "where suitable"
- See if instructions describe WHAT without explaining HOW

### What to Do Instead
**Show, don't tell**:

```
## Your Identity
You're like that colleague who always closes deals because they know exactly what to say and when to say it—confident but not cocky, helpful without being salesy.

## Response Patterns
- After asking a question, STOP completely and wait for response
- NEVER add explanatory statements after questions
- Vary how you acknowledge responses - sometimes don't acknowledge at all
- Express genuine emotion based on what they share
```

**Why this works**: Creates mental model and provides concrete behavioral guidance.

---

## Anti-Pattern 6: Asking Multiple Questions in One Response

### Description
Including instructions or examples that show asking 2-3 questions in a single agent turn.

### Example (WRONG)
```
## Discovery Questions
Ask about their situation:
- "What type of leads are you working with? Are they cold calls or warm referrals? And how many are you contacting per day?"
```

### Why This Fails
- **Overwhelming**: User doesn't know which question to answer first
- **Reduces response quality**: User picks easiest question, ignores others
- **Unnatural**: People don't ask multiple questions in real conversations
- **Looks like interrogation**: Feels like being grilled

### What to Do Instead
```
## Question Strategy
- Ask ONE question at a time
- Wait for complete response
- Then ask relevant follow-up based on their answer
- Vary question formats (open-ended, single-focus, assumptive)
```

---

## Anti-Pattern 7: Forced Acknowledgments After Every Response

### Description
Instructing agent to acknowledge every user response with phrases like "I understand", "That's great", "I see".

### Example (WRONG)
```
## Active Listening
- Acknowledge every response with "I understand" or "I see"
- Start each reply with recognition of what they said
- Use phrases like "That's great" or "That makes sense"
```

### Why This Fails
- **Robotic pattern**: Every response starts with same acknowledgment
- **Wastes words**: Uses 2-3 sentences on acknowledgment instead of substance
- **Insincere**: Obviously forced, doesn't sound genuine
- **Predictable**: User notices the pattern quickly

### What to Do Instead
```
## Natural Response Patterns
When users share routine information:
- Continue the conversation naturally without forced acknowledgment
- Sometimes acknowledge briefly, sometimes don't acknowledge at all
- If you do acknowledge, vary how you do it each time

When users share something significant:
- React authentically if the information is surprising or important
- Show genuine interest or empathy where appropriate
```

---

## Anti-Pattern 8: Numbered Lists or Bullet Points in Conversation

### Description
Formatting information as numbered lists or bullet points when speaking (e.g., "There are three benefits: 1) Speed, 2) Cost, 3) Quality").

### Example (WRONG)
```
Agent: "There are three main benefits to our platform:
1. Speed - You can launch in 10 minutes
2. Cost - Starting at $199 per month
3. Quality - AI trained on real conversations"
```

### Why This Fails
- **Unnatural speech**: People don't talk in numbered lists
- **Robotic delivery**: Sounds like reading from slides
- **Breaks conversation flow**: Feels like a presentation, not dialogue
- **Loss of engagement**: User stops listening by item 3

### What to Do Instead
```
## Explaining Information
- Break complex information into digestible pieces with natural transitions
- Speak as if explaining to a colleague over coffee
- Never format as numbered lists or bullet points in conversation
- When discussing multiple points, weave them into natural sentences
```

---

## Anti-Pattern 9: Pushing for Commitment After Every Exchange

### Description
Instructing agent to attempt closing or push toward scheduling after every single user response.

### Example (WRONG)
```
## Closing Strategy
After each answer from the prospect:
- Attempt to move toward scheduling
- Use assumptive close
- Ask when they'd like to meet
- Push for commitment
```

### Why This Fails
- **Pushy and annoying**: User feels pressured
- **Ignores conversation flow**: May be in discovery mode, not ready
- **Reduces trust**: Seems desperate or manipulative
- **Lower conversion**: Pushing too early triggers objections

### What to Do Instead
```
## Strategic Closing
- Don't immediately push for demo after every exchange
- When users ask multiple questions, answer thoroughly—they're showing interest
- After addressing concerns, first confirm understanding before suggesting next steps
- Read the conversation flow - if they're in discovery mode, help them discover
```

---

## Anti-Pattern 10: Contradictory Instructions

### Description
Including instructions that conflict with each other (e.g., "be brief" + "explain thoroughly", "sound natural" + "follow this script").

### Example (WRONG)
```
## Response Guidelines
- Keep responses to 1-2 sentences maximum
- Explain all features in detail
- Be concise and brief
- Provide comprehensive answers
- Sound natural and conversational
- Follow this exact script:
  1. Greet
  2. Qualify
  3. Close
```

### Why This Fails
- **Confuses the LLM**: Can't prioritize conflicting rules
- **Inconsistent output**: Agent behavior varies unpredictably
- **No clear direction**: Which rule applies when they conflict?

### What to Do Instead
- **Review for contradictions**: Read through prompt looking for conflicts
- **Prioritize**: If two rules conflict, choose one and delete the other
- **Clarify**: If both are important, explain WHEN each applies

---

## Anti-Pattern 11: Overly Verbose Prompt Structure

### Description
Prompt is 500+ lines with dense instructions, while telling agent to "be concise".

### Why This Fails
- **Hypocrisy**: Telling agent to be brief while being verbose yourself
- **Cognitive load**: Too much to internalize and apply
- **Hidden contradictions**: More likely to have conflicting instructions

### What to Do Instead
- **If prompt is verbose**, check if you can:
  - Delete or combine overlapping sections
  - Remove contradictory instructions
  - Replace numbered steps with flow-based guidance
  - Extract detailed company knowledge to separate sections
- **Remember**: Detailed prompt → SHORT responses is correct (golden example is 394 lines)
- **But**: Detail should teach principles, not prescribe actions

---

## Using These Anti-Patterns

### For Generator LLM
When creating new prompts:
1. Actively avoid all 11 anti-patterns above
2. Check generated output against this list before finalizing
3. If any pattern appears, revise to use the "What to Do Instead" approach

### For Critic LLM
When analyzing transcripts:
1. Detect if agent behavior matches anti-pattern symptoms
2. Report in `prompt_structure_issues` field
3. Reference specific anti-pattern number(s)

### For Refinement LLM
When improving prompts:
1. Check if feedback indicates anti-pattern present
2. Consider DELETING problematic sections
3. Replace with flow-based, principle-driven alternatives
4. Verify revised prompt doesn't introduce different anti-patterns

---

## Pattern Evolution

As feedback loop generates new learnings:
- New anti-patterns will be added through Pattern Extractor LLM
- This file will grow over time
- Patterns with `prompt_structure` type will be added here
- High-impact patterns will be elevated with metadata updates

---

## Summary: Quick Reference

❌ **DON'T**:
1. Use numbered procedural steps (1, 2, 3)
2. Create 5+ overlapping instruction sections
3. Provide pre-scripted "power phrases"
4. Use literal percentages or rigid metrics
5. Say "sound natural" without teaching how
6. Ask multiple questions in one response
7. Force acknowledgments after every response
8. Format information as numbered lists/bullets
9. Push for commitment after every exchange
10. Include contradictory instructions
11. Write verbose prompts while telling agent to be brief

✅ **DO**:
- Use flow-based phases that teach purpose
- Consolidate to ≤3 clear instruction sections
- Teach transition strategies, not exact phrases
- Provide guidance with natural ranges
- Show by example how to be natural
- Ask one question at a time
- Vary acknowledgment patterns (sometimes none)
- Speak conversationally, not in lists
- Read conversation flow before pushing
- Review for contradictions and prioritize
- Detail should teach principles, not prescribe actions
