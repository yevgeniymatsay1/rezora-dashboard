/**
 * Prompt Compiler
 *
 * Transforms human-readable markdown sections into Retell-compatible payload.
 *
 * Input format (from LLM):
 * ```markdown
 * # BASE_PROMPT
 * You are an AI agent...
 *
 * # WARM_INTRO
 * Start the conversation by...
 *
 * # SCHEDULE_MEET
 * When booking appointments...
 * ```
 *
 * Output format (for Retell API):
 * ```json
 * {
 *   "base_prompt": "You are an AI agent...",
 *   "states": [
 *     {"name": "warm_intro", "state_prompt": "Start the conversation...", "edges": [...], "tools": [...]},
 *     {"name": "schedule_meet", "state_prompt": "When booking...", "edges": [...], "tools": [...]}
 *   ]
 * }
 * ```
 */

export interface MarkdownSections {
  [sectionName: string]: string;
}

export interface StateEdge {
  description: string;
  destination_state_name: string;
  parameters?: Record<string, any>;
}

export interface StateTool {
  name: string;
  type: string;
  description: string;
  speak_during_execution?: boolean;
  speak_after_execution?: boolean;
  parameters?: Record<string, any>;
}

export interface CompiledState {
  name: string;
  state_prompt: string;
  edges?: StateEdge[];
  tools?: StateTool[];
}

export interface RetellPayload {
  base_prompt: string;
  states: CompiledState[];
}

export interface StateConfig {
  [stateName: string]: {
    edges?: StateEdge[];
    tools?: StateTool[];
  };
}

/**
 * Default state configuration for common agent patterns
 */
export const DEFAULT_STATE_CONFIG: StateConfig = {
  warm_intro: {
    edges: [
      {
        description: 'User is interested and ready to schedule',
        destination_state_name: 'schedule_meet'
      },
      {
        description: 'User needs more information before deciding',
        destination_state_name: 'warm_intro' // Stay in current state
      },
      {
        description: 'User is not interested and wants to end call',
        destination_state_name: 'end_call'
      }
    ],
    tools: []
  },
  schedule_meet: {
    edges: [
      {
        description: 'Successfully booked appointment',
        destination_state_name: 'end_call'
      },
      {
        description: 'User wants to go back to discussion',
        destination_state_name: 'warm_intro'
      }
    ],
    tools: [
      {
        name: 'check_availability',
        type: 'check_availability_cal',
        description: 'Check if a specific date and time slot is available on the calendar',
        speak_during_execution: true,
        speak_after_execution: false
      },
      {
        name: 'book_appointment',
        type: 'book_appointment_cal',
        description: 'Book an appointment on the calendar at a specific date and time',
        speak_during_execution: false,
        speak_after_execution: true
      }
    ]
  },
  end_call: {
    edges: [],
    tools: [
      {
        name: 'end_call',
        type: 'end_call',
        description: 'End the call politely',
        speak_during_execution: false,
        speak_after_execution: false
      }
    ]
  }
};

/**
 * Parse markdown into sections by H1 headers
 *
 * @param markdown Markdown text with H1 sections
 * @returns Object mapping section names to content
 */
export function parseMarkdownSections(markdown: string): MarkdownSections {
  const sections: MarkdownSections = {};

  if (!markdown || typeof markdown !== 'string') {
    return sections;
  }

  const lines = markdown.split('\n');
  let currentSection: string | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    // Check for H1 header (# Section Name)
    if (line.trim().startsWith('# ')) {
      // Save previous section
      if (currentSection) {
        sections[currentSection] = currentContent.join('\n').trim();
      }

      // Start new section
      const sectionName = line.slice(2).trim();
      currentSection = normalizeSectionName(sectionName);
      currentContent = [];
    } else if (currentSection) {
      // Accumulate content for current section
      currentContent.push(line);
    }
  }

  // Save final section
  if (currentSection) {
    sections[currentSection] = currentContent.join('\n').trim();
  }

  return sections;
}

/**
 * Normalize section name to state name format
 *
 * Examples:
 * - "BASE_PROMPT" → "BASE_PROMPT" (special case)
 * - "WARM_INTRO" → "warm_intro"
 * - "Warm Intro State Prompt" → "warm_intro"
 * - "Schedule Meet" → "schedule_meet"
 *
 * @param sectionName Raw section name from markdown
 * @returns Normalized state name
 */
export function normalizeSectionName(sectionName: string): string {
  // Special case: BASE_PROMPT stays uppercase
  if (sectionName.toUpperCase() === 'BASE_PROMPT' || sectionName.toUpperCase() === 'BASE PROMPT') {
    return 'BASE_PROMPT';
  }

  // Remove common suffixes
  let normalized = sectionName
    .replace(/\s+State\s+Prompt$/i, '')
    .replace(/\s+State$/i, '')
    .replace(/\s+Prompt$/i, '');

  // Convert to snake_case
  normalized = normalized
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

  return normalized;
}

/**
 * Compile markdown sections into Retell payload
 *
 * @param markdown Markdown text with sections
 * @param stateConfig Optional custom state configuration (edges, tools)
 * @returns Compiled Retell payload
 */
export function compilePromptSections(
  markdown: string,
  stateConfig: StateConfig = {}
): RetellPayload {
  // Parse sections
  const sections = parseMarkdownSections(markdown);

  // Extract base prompt
  const base_prompt = sections.BASE_PROMPT || sections.base_prompt || '';

  if (!base_prompt) {
    throw new Error('Missing BASE_PROMPT section in markdown');
  }

  // Build states from remaining sections
  const states: CompiledState[] = [];

  for (const [sectionName, content] of Object.entries(sections)) {
    // Skip BASE_PROMPT (already extracted)
    if (sectionName === 'BASE_PROMPT' || sectionName === 'base_prompt') {
      continue;
    }

    // Skip empty sections
    if (!content || content.trim() === '') {
      continue;
    }

    // Get config for this state (custom or default)
    const config = stateConfig[sectionName] || DEFAULT_STATE_CONFIG[sectionName] || {};

    // Build state object
    const state: CompiledState = {
      name: sectionName,
      state_prompt: content,
      edges: config.edges || [],
      tools: config.tools || []
    };

    states.push(state);
  }

  // Sort states to ensure consistent order (warm_intro first, schedule_meet second, etc.)
  const stateOrder = ['warm_intro', 'schedule_meet', 'end_call'];
  states.sort((a, b) => {
    const aIndex = stateOrder.indexOf(a.name);
    const bIndex = stateOrder.indexOf(b.name);

    // If both are in the order list, sort by position
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }

    // If only one is in the order list, prioritize it
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;

    // Otherwise, sort alphabetically
    return a.name.localeCompare(b.name);
  });

  // Remove edges pointing to undefined states (except special destinations like end_call)
  const stateNameSet = new Set(states.map((state) => state.name));
  for (const state of states) {
    if (!state.edges || state.edges.length === 0) continue;
    state.edges = state.edges.filter((edge) => {
      if (!edge.destination_state_name) return false;
      if (edge.destination_state_name === state.name) return true;
      if (edge.destination_state_name === 'end_call') return true;
      return stateNameSet.has(edge.destination_state_name);
    });
  }

  return {
    base_prompt,
    states
  };
}

/**
 * Decompile Retell payload back to markdown (inverse operation)
 *
 * Useful for:
 * - Editing existing prompts in human-readable format
 * - Version control diffs
 * - Documentation
 *
 * @param payload Retell payload
 * @returns Markdown string
 */
export function decompileToMarkdown(payload: RetellPayload): string {
  const sections: string[] = [];

  // Add base prompt section
  sections.push('# BASE_PROMPT\n\n' + payload.base_prompt);

  // Add state sections
  for (const state of payload.states) {
    // Convert state name to title case for markdown header
    const headerName = state.name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    sections.push(`\n# ${headerName}\n\n` + state.state_prompt);
  }

  return sections.join('\n');
}

/**
 * Validate compiled payload for Retell API
 *
 * @param payload Compiled payload
 * @returns Array of validation errors (empty if valid)
 */
export function validateCompiledPayload(payload: RetellPayload): string[] {
  const errors: string[] = [];

  // Validate base_prompt
  if (!payload.base_prompt || payload.base_prompt.trim() === '') {
    errors.push('base_prompt is required and cannot be empty');
  }

  // Validate states
  if (!Array.isArray(payload.states)) {
    errors.push('states must be an array');
  } else {
    if (payload.states.length === 0) {
      errors.push('At least one state is required');
    }

    // Validate each state
    for (let i = 0; i < payload.states.length; i++) {
      const state = payload.states[i];
      const prefix = `states[${i}]`;

      if (!state.name) {
        errors.push(`${prefix}.name is required`);
      }

      if (!state.state_prompt || state.state_prompt.trim() === '') {
        errors.push(`${prefix}.state_prompt is required and cannot be empty`);
      }

      // Validate edges destinations exist
      if (state.edges && Array.isArray(state.edges)) {
        for (let j = 0; j < state.edges.length; j++) {
          const edge = state.edges[j];
          const edgePrefix = `${prefix}.edges[${j}]`;

          if (!edge.destination_state_name) {
            errors.push(`${edgePrefix}.destination_state_name is required`);
          } else {
            // Check if destination state exists (or is end_call)
            const destinationExists =
              edge.destination_state_name === 'end_call' ||
              edge.destination_state_name === state.name || // Self-loop
              payload.states.some(s => s.name === edge.destination_state_name);

            if (!destinationExists) {
              errors.push(
                `${edgePrefix}.destination_state_name "${edge.destination_state_name}" ` +
                `does not match any defined state`
              );
            }
          }
        }
      }
    }
  }

  return errors;
}
