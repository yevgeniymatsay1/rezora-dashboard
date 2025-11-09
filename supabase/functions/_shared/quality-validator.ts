/**
 * Quality Validator for Generated Prompts
 *
 * Validates generated prompts against structural and quality principles:
 * - Flow-based structure (not numbered steps)
 * - No quoted scripts (teaches flow, not dialogue)
 * - Natural language (not robotic AI phrases)
 * - 1-sentence response emphasis
 * - Strategic, human-like communication
 */

export type IssueSeverity = "critical" | "high" | "medium" | "low";

export interface QualityIssue {
  type: string;
  severity: IssueSeverity;
  message: string;
  location?: string;
  lineNumber?: number;
  suggestion?: string;
}

export interface QualityValidationResult {
  score: number; // 0-100
  passed: boolean; // score >= 60
  issues: QualityIssue[];
  suggestions: string[];
  criticalIssuesCount: number;
  highSeverityCount: number;
  mediumSeverityCount: number;
  lowSeverityCount: number;
}

/**
 * Detect numbered steps in prompt (critical issue)
 * Flow-based prompts should use ## Section Headers, not 1. 2. 3.
 */
export function detectNumberedSteps(markdown: string): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const lines = markdown.split('\n');

  // Patterns that indicate numbered steps
  const numberedPatterns = [
    /^\s*\d+\.\s+[A-Z]/m, // "1. Something"
    /^\s*Step\s+\d+/mi,    // "Step 1" or "step 1"
    /^\s*\(\d+\)/m,        // "(1)"
    /^\s*\d+\)\s+[A-Z]/m   // "1) Something"
  ];

  lines.forEach((line, index) => {
    numberedPatterns.forEach(pattern => {
      if (pattern.test(line)) {
        issues.push({
          type: "numbered_steps",
          severity: "critical",
          message: `Numbered step detected: "${line.trim()}"`,
          location: line.trim().substring(0, 50),
          lineNumber: index + 1,
          suggestion: "Replace numbered steps with flow-based ## Section Headers that describe goals, not procedures"
        });
      }
    });
  });

  return issues;
}

/**
 * Detect quoted scripts in state prompts (critical issue)
 *
 * Prompts should teach conversational flow and principles, not provide
 * word-for-word scripts. Quoted dialogue makes agents sound scripted.
 *
 * STRICT: Flag ANY quoted dialogue >10 words in state prompts
 * ALLOW: Teaching principles with contrast (❌ vs ✅)
 * ALLOW: Quotes in BASE_PROMPT for context/examples
 */
export function detectQuotedScripts(markdown: string): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // Split markdown into sections
  const sections = markdown.split(/^#\s+/m).filter(s => s.trim());

  sections.forEach(section => {
    const sectionHeader = section.split('\n')[0].trim().toLowerCase();
    const isBasePrompt = sectionHeader.includes('base') && sectionHeader.includes('prompt');

    // Skip BASE_PROMPT - quotes allowed for context
    if (isBasePrompt) {
      return;
    }

    const lines = section.split('\n');

    lines.forEach((line, lineIndex) => {
      // Pattern 1: Imperative + quoted dialogue
      // "Say: "Hi there...", "Tell them: "We have...", "Ask: "Would you..."
      const imperativePattern = /\b(Say|Tell them|Tell|Ask|Open with|Start with|Begin by saying|Respond with|Reply with):\s*["']([^"']{10,})["']/gi;
      let match;

      while ((match = imperativePattern.exec(line)) !== null) {
        const quotedText = match[2];

        // Check if this is a teaching contrast (❌ vs ✅)
        const isTeachingContrast = /[❌✅✓✗]/.test(line) ||
                                    /\b(avoid|prefer|instead|not|don't)\b/i.test(line);

        if (!isTeachingContrast) {
          issues.push({
            type: "quoted_script",
            severity: "critical",
            message: `Quoted script detected: ${match[1]}: "${quotedText.substring(0, 50)}..."`,
            location: sectionHeader,
            lineNumber: lineIndex + 1,
            suggestion: "Replace quoted scripts with flow guidance. Teach HOW to communicate, not WHAT to say word-for-word"
          });
        }
      }

      // Pattern 2: Role-play format
      // "Agent: "Hi there...", "You: "I'm calling..."
      const rolePlayPattern = /\b(Agent|You|AI|Assistant):\s*["']([^"']{10,})["']/gi;

      while ((match = rolePlayPattern.exec(line)) !== null) {
        const quotedText = match[2];
        const isTeachingContrast = /[❌✅✓✗]/.test(line) ||
                                    /\b(avoid|prefer|instead|not|don't)\b/i.test(line);

        if (!isTeachingContrast) {
          issues.push({
            type: "quoted_script",
            severity: "critical",
            message: `Role-play script detected: ${match[1]}: "${quotedText.substring(0, 50)}..."`,
            location: sectionHeader,
            lineNumber: lineIndex + 1,
            suggestion: "Remove role-play dialogue. Describe the conversational approach instead"
          });
        }
      }

      // Pattern 3: Example dialogue markers
      // "Example: "Hi there...", "For example: "I'm calling..."
      const examplePattern = /\b(Example|For example|Sample|Like this):\s*["']([^"']{10,})["']/gi;

      while ((match = examplePattern.exec(line)) !== null) {
        const quotedText = match[2];
        const isTeachingContrast = /[❌✅✓✗]/.test(line) ||
                                    /\b(avoid|prefer|instead|not|don't)\b/i.test(line);

        if (!isTeachingContrast) {
          issues.push({
            type: "quoted_script",
            severity: "critical",
            message: `Example script detected: "${quotedText.substring(0, 50)}..."`,
            location: sectionHeader,
            lineNumber: lineIndex + 1,
            suggestion: "Remove example dialogue. Teach principles, not scripts"
          });
        }
      }
    });

    // Pattern 4: Multi-line quoted sections (3+ consecutive lines with quotes)
    let consecutiveQuoteLines = 0;
    let quoteBlockStart = -1;

    lines.forEach((line, lineIndex) => {
      const hasLongQuote = /"[^"]{20,}"|'[^']{20,}'/.test(line);

      if (hasLongQuote) {
        if (consecutiveQuoteLines === 0) {
          quoteBlockStart = lineIndex;
        }
        consecutiveQuoteLines++;
      } else {
        if (consecutiveQuoteLines >= 3) {
          // Found a multi-line quoted block
          issues.push({
            type: "quoted_script_block",
            severity: "critical",
            message: `Multi-line quoted script block detected (${consecutiveQuoteLines} lines)`,
            location: sectionHeader,
            lineNumber: quoteBlockStart + 1,
            suggestion: "Remove quoted dialogue blocks. Describe conversational flow and strategy instead"
          });
        }
        consecutiveQuoteLines = 0;
        quoteBlockStart = -1;
      }
    });
  });

  return issues;
}

/**
 * Detect robotic AI phrases
 * Agents should sound human, not like corporate AI assistants
 */
export function detectRoboticPhrases(markdown: string): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // Common robotic AI phrases to avoid
  const roboticPhrases = [
    "I understand your concern",
    "I appreciate your perspective",
    "Thank you for sharing",
    "Let me provide you with",
    "I'd be happy to help",
    "I'm here to assist",
    "I apologize for any inconvenience",
    "I understand how you feel",
    "That's a great question",
    "I hear what you're saying",
    "I completely understand",
    "Thank you for bringing that to my attention"
  ];

  const lines = markdown.split('\n');

  roboticPhrases.forEach(phrase => {
    const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

    lines.forEach((line, index) => {
      if (regex.test(line)) {
        issues.push({
          type: "robotic_phrase",
          severity: "high",
          message: `Robotic AI phrase detected: "${phrase}"`,
          location: line.trim().substring(0, 60),
          lineNumber: index + 1,
          suggestion: "Use natural human language instead. Examples: 'Fair point', 'Got it', 'So let me ask you this...'"
        });
      }
    });
  });

  return issues;
}

/**
 * Verify response length guidance
 * Prompts should emphasize 1-sentence responses, not 2-3 sentences
 */
export function verifyResponseLengthGuidance(markdown: string): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // Check if prompt emphasizes brief responses
  const hasOneSentenceGuidance = /\b(one sentence|1 sentence|single sentence)\b/i.test(markdown);
  const hasBriefGuidance = /\b(brief|concise|short|quick)\b.*\b(response|reply|answer)/i.test(markdown);

  // Check for problematic multi-sentence guidance
  const hasTwoThreeSentenceGuidance = /\b(2-3 sentences|two to three sentences|multiple sentences)\b/i.test(markdown);

  if (!hasOneSentenceGuidance && !hasBriefGuidance) {
    issues.push({
      type: "missing_response_guidance",
      severity: "medium",
      message: "Missing emphasis on brief 1-sentence responses",
      suggestion: "Add guidance emphasizing: 'Typically one sentence per response' or 'Keep responses brief and natural'"
    });
  }

  if (hasTwoThreeSentenceGuidance) {
    issues.push({
      type: "verbose_response_guidance",
      severity: "high",
      message: "Prompt suggests 2-3 sentence responses instead of 1 sentence",
      suggestion: "Change to emphasize 1 sentence typically, 2 sentences only if absolutely necessary"
    });
  }

  return issues;
}

/**
 * Detect flow-based structure
 * Should use ## Section Headers for phases, not numbered steps
 */
export function detectFlowBasedStructure(markdown: string): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // Split into sections
  const sections = markdown.split(/^#\s+/m).filter(s => s.trim());

  sections.forEach(section => {
    const sectionHeader = section.split('\n')[0].trim();

    // Check if section uses ## subsection headers (good)
    const hasFlowSections = /^##\s+[A-Z]/m.test(section);

    // Check if section has numbered list (bad)
    const hasNumberedList = /^\s*\d+\.\s+/m.test(section);

    if (hasNumberedList && !hasFlowSections) {
      issues.push({
        type: "numbered_structure",
        severity: "critical",
        message: `Section "${sectionHeader}" uses numbered list instead of flow-based structure`,
        location: sectionHeader,
        suggestion: "Replace numbered procedures with ## Flow Section headers that describe goals and strategies"
      });
    }
  });

  return issues;
}

/**
 * Calculate quality score based on issues
 *
 * Scoring:
 * - Start at 100
 * - Critical issues: -20 points each (auto-fail if any exist)
 * - High severity: -10 points each
 * - Medium severity: -5 points each
 * - Low severity: -2 points each
 */
export function calculateQualityScore(issues: QualityIssue[]): number {
  let score = 100;

  issues.forEach(issue => {
    switch (issue.severity) {
      case "critical":
        score -= 20;
        break;
      case "high":
        score -= 10;
        break;
      case "medium":
        score -= 5;
        break;
      case "low":
        score -= 2;
        break;
    }
  });

  // Floor at 0
  return Math.max(0, score);
}

/**
 * Strip quality feedback context from markdown before validation
 * The feedback section contains examples of what NOT to do, which would
 * incorrectly trigger quality issues if validated.
 */
function stripFeedbackContext(markdown: string): string {
  // Remove feedback section marked with HTML comments
  const feedbackRegex = /<!-- QUALITY_FEEDBACK_START -->[\s\S]*?<!-- QUALITY_FEEDBACK_END -->/g;
  let cleaned = markdown.replace(feedbackRegex, '');

  // Also remove any legacy feedback sections (backward compatibility)
  const legacyRegex = /## ⚠️ CRITICAL: FIX THESE ISSUES FROM PREVIOUS GENERATION[\s\S]*?---\n\n/g;
  cleaned = cleaned.replace(legacyRegex, '');

  return cleaned;
}

/**
 * Main quality validation function
 * Runs all checks and aggregates results
 */
export function detectQualityIssues(markdown: string): QualityValidationResult {
  // Strip feedback context before validation to avoid false positives
  const cleanedMarkdown = stripFeedbackContext(markdown);

  const allIssues: QualityIssue[] = [];

  // Run all detection functions on cleaned content
  allIssues.push(...detectNumberedSteps(cleanedMarkdown));
  allIssues.push(...detectQuotedScripts(cleanedMarkdown));
  allIssues.push(...detectRoboticPhrases(cleanedMarkdown));
  allIssues.push(...verifyResponseLengthGuidance(cleanedMarkdown));
  allIssues.push(...detectFlowBasedStructure(cleanedMarkdown));

  // Count by severity
  const criticalIssuesCount = allIssues.filter(i => i.severity === "critical").length;
  const highSeverityCount = allIssues.filter(i => i.severity === "high").length;
  const mediumSeverityCount = allIssues.filter(i => i.severity === "medium").length;
  const lowSeverityCount = allIssues.filter(i => i.severity === "low").length;

  // Calculate score
  const score = calculateQualityScore(allIssues);

  // Auto-fail if critical issues exist
  const passed = criticalIssuesCount === 0 && score >= 60;

  // Generate suggestions
  const suggestions: string[] = [];

  if (criticalIssuesCount > 0) {
    suggestions.push("CRITICAL: Fix numbered steps and quoted scripts before proceeding");
  }

  if (highSeverityCount > 0) {
    suggestions.push("Replace robotic AI phrases with natural human language");
  }

  if (!passed && criticalIssuesCount === 0) {
    suggestions.push("Address high and medium severity issues to improve quality score");
  }

  if (allIssues.length === 0) {
    suggestions.push("Excellent! Prompt follows all quality principles");
  }

  return {
    score,
    passed,
    issues: allIssues,
    suggestions,
    criticalIssuesCount,
    highSeverityCount,
    mediumSeverityCount,
    lowSeverityCount
  };
}
