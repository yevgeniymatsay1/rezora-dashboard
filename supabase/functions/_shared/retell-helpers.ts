/**
 * Retell API Integration Helpers
 *
 * Provides functions for creating, updating, and deleting Retell LLMs and Agents.
 * Used by both update-draft-agent and test-prompt-sandbox functions.
 */

const RETELL_API_BASE = "https://api.retellai.com";
const RETELL_API_KEY = Deno.env.get("RETELL_API_KEY") ?? "";

if (!RETELL_API_KEY) {
  console.warn("RETELL_API_KEY not configured - Retell integration disabled");
}

/**
 * Clean state object for Retell API
 * Removes edges and tools properties that shouldn't be sent to Retell API
 */
export function cleanStateForRetell(state: any): any {
  const { edges, tools, ...cleanState } = state;
  return cleanState;
}

/**
 * Clean array of states for Retell API
 */
export function cleanStatesForRetell(states: any[]): any[] {
  if (!Array.isArray(states)) return [];
  return states.map(cleanStateForRetell);
}

/**
 * Create Retell LLM
 */
export async function createRetellLLM(
  generalPrompt: string,
  states: any[],
  modelName: string = "gpt-4o"
): Promise<{ llm_id: string }> {
  if (!RETELL_API_KEY) {
    throw new Error("RETELL_API_KEY not configured");
  }

  const payload = {
    model: modelName,
    general_prompt: generalPrompt,
    general_tools: [
      {
        type: "end_call",
        name: "end_call",
        description: ""
      }
    ],
    states: cleanStatesForRetell(states),
    starting_state: states.length > 0 ? states[0].name : "warm_intro",
    begin_message: null,
  };

  console.log("[Retell] Creating LLM with model:", modelName);

  const response = await fetch(`${RETELL_API_BASE}/create-retell-llm`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RETELL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Retell] Failed to create LLM:", response.status, errorText);
    throw new Error(`Retell API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  console.log("[Retell] LLM created:", data.llm_id);

  return { llm_id: data.llm_id };
}

/**
 * Update existing Retell LLM
 */
export async function updateRetellLLM(
  llmId: string,
  generalPrompt: string,
  states: any[]
): Promise<void> {
  if (!RETELL_API_KEY) {
    throw new Error("RETELL_API_KEY not configured");
  }

  const cleanedStates = cleanStatesForRetell(states);

  const payload = {
    general_prompt: generalPrompt,
    states: cleanedStates,
    starting_state: cleanedStates.length > 0 ? cleanedStates[0].name : "warm_intro",
    general_tools: [
      {
        type: "end_call",
        name: "end_call",
        description: ""
      }
    ],
  };

  console.log("[Retell] Updating LLM:", llmId);

  const response = await fetch(`${RETELL_API_BASE}/update-retell-llm/${llmId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${RETELL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Retell] Failed to update LLM:", response.status, errorText);
    throw new Error(`Retell API error (${response.status}): ${errorText}`);
  }

  console.log("[Retell] LLM updated successfully");
}

/**
 * Delete Retell LLM
 */
export async function deleteRetellLLM(llmId: string): Promise<void> {
  if (!RETELL_API_KEY) {
    throw new Error("RETELL_API_KEY not configured");
  }

  console.log("[Retell] Deleting LLM:", llmId);

  const response = await fetch(`${RETELL_API_BASE}/delete-retell-llm/${llmId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${RETELL_API_KEY}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Retell] Failed to delete LLM:", response.status, errorText);
    throw new Error(`Retell API error (${response.status}): ${errorText}`);
  }

  console.log("[Retell] LLM deleted successfully");
}

/**
 * Create Retell Agent
 */
export async function createRetellAgent(
  llmId: string,
  agentName: string,
  voiceId: string = "11labs-Adrian"
): Promise<{ agent_id: string }> {
  if (!RETELL_API_KEY) {
    throw new Error("RETELL_API_KEY not configured");
  }

  const payload = {
    response_engine: {
      type: "retell-llm",
      llm_id: llmId,
    },
    voice_id: voiceId,
    agent_name: agentName,
    voice_model: "eleven_turbo_v2_5",
    voice_temperature: 1,
    voice_speed: 0.92,
    volume: 1,
    language: "en-US",
    // Optional: add webhook URL for call events
    // webhook_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/retell-webhook`,
  };

  console.log("[Retell] Creating Agent:", agentName);

  const response = await fetch(`${RETELL_API_BASE}/create-agent`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RETELL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Retell] Failed to create Agent:", response.status, errorText);
    throw new Error(`Retell API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  console.log("[Retell] Agent created:", data.agent_id);

  return { agent_id: data.agent_id };
}

/**
 * Update existing Retell Agent
 */
export async function updateRetellAgent(
  agentId: string,
  llmId: string,
  agentName: string
): Promise<void> {
  if (!RETELL_API_KEY) {
    throw new Error("RETELL_API_KEY not configured");
  }

  const payload = {
    llm_id: llmId,
    agent_name: agentName,
  };

  console.log("[Retell] Updating Agent:", agentId);

  const response = await fetch(`${RETELL_API_BASE}/update-agent/${agentId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${RETELL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Retell] Failed to update Agent:", response.status, errorText);
    throw new Error(`Retell API error (${response.status}): ${errorText}`);
  }

  console.log("[Retell] Agent updated successfully");
}

/**
 * Delete Retell Agent
 */
export async function deleteRetellAgent(agentId: string): Promise<void> {
  if (!RETELL_API_KEY) {
    throw new Error("RETELL_API_KEY not configured");
  }

  console.log("[Retell] Deleting Agent:", agentId);

  const response = await fetch(`${RETELL_API_BASE}/delete-agent/${agentId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${RETELL_API_KEY}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Retell] Failed to delete Agent:", response.status, errorText);
    throw new Error(`Retell API error (${response.status}): ${errorText}`);
  }

  console.log("[Retell] Agent deleted successfully");
}

/**
 * Check if Retell API is configured
 */
export function isRetellAvailable(): boolean {
  return Boolean(RETELL_API_KEY);
}
