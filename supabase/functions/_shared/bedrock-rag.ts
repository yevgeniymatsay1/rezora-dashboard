/**
 * AWS Bedrock Knowledge Base RAG Utility
 *
 * Provides functions for retrieving context from Bedrock Knowledge Base
 * to enhance prompt generation with learned patterns and best practices.
 */

import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID") ?? "";
const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY") ?? "";
const sessionToken = Deno.env.get("AWS_SESSION_TOKEN") ?? undefined;
const region = Deno.env.get("AWS_REGION") ?? Deno.env.get("AWS_DEFAULT_REGION") ?? "";
const knowledgeBaseId = Deno.env.get("BEDROCK_KB_ID") ?? "";
const knowledgeBaseDataSourceId = Deno.env.get("BEDROCK_KB_DATA_SOURCE_ID") ?? "";

const hasKBConfigured = Boolean(knowledgeBaseId && region && accessKeyId && secretAccessKey);
const hasKBIngestionConfigured = Boolean(hasKBConfigured && knowledgeBaseDataSourceId);
const bedrockAgentRuntimeBaseUrl = region
  ? `https://bedrock-agent-runtime.${region}.amazonaws.com`
  : "";
const bedrockAgentControlBaseUrl = region
  ? `https://bedrock-agent.${region}.amazonaws.com`
  : "";

if (!hasKBConfigured) {
  console.warn(
    "Bedrock Knowledge Base not fully configured. RAG features will be disabled. " +
    "Set: BEDROCK_KB_ID, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
  );
}

if (!hasKBIngestionConfigured) {
  console.warn(
    "Bedrock Knowledge Base ingestion not fully configured. Automatic sync is disabled. " +
    "Set: BEDROCK_KB_DATA_SOURCE_ID so new patterns can be ingested."
  );
}

// AWS Bedrock Agent APIs use 'bedrock' as the signing service name
// even though the endpoint is bedrock-agent-runtime.{region}.amazonaws.com
const bedrockAgentClient = hasKBConfigured
  ? new AwsClient({
      accessKeyId,
      secretAccessKey,
      sessionToken,
      region,
      service: "bedrock", // AWS signing service name for all Bedrock APIs
    })
  : null;

export interface RAGResult {
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
  location?: {
    s3Key?: string;
    type?: string;
  };
}

export interface RetrievalConfig {
  numberOfResults?: number; // Default: 8
  filterCriteria?: {
    pattern_type?: string;
    agent_category?: string;
    min_rating_impact?: number;
  };
}

/**
 * Retrieve relevant context from Bedrock Knowledge Base
 *
 * @param query - The search query (e.g., "best practices for cold calling wholesaler agents")
 * @param config - Retrieval configuration (number of results, filters)
 * @returns Array of relevant text chunks with metadata
 */
export async function retrieveKnowledgeBaseContext(
  query: string,
  config: RetrievalConfig = {}
): Promise<RAGResult[]> {
  if (!hasKBConfigured) {
    console.warn("Knowledge Base not configured. Skipping RAG retrieval.");
    return [];
  }

  if (!query || query.trim().length === 0) {
    console.warn("Empty query provided to RAG retrieval.");
    return [];
  }

  if (!bedrockAgentRuntimeBaseUrl) {
    console.error("[RAG] Runtime endpoint unavailable. Check AWS region configuration.");
    return [];
  }

  const numberOfResults = config.numberOfResults ?? 8;

  try {
    // DIAGNOSTIC LOGGING
    console.log("[RAG] Attempting KB retrieve with config:", {
      knowledgeBaseId,
      region,
      hasCredentials: Boolean(accessKeyId && secretAccessKey),
      credentialsPreview: accessKeyId ? `${accessKeyId.slice(0, 8)}...` : "missing",
      query: query.slice(0, 50) + "..."
    });

    const requestBody = {
      // knowledgeBaseId removed - it's in the URL path already
      retrievalQuery: {
        text: query.trim(),
      },
      retrievalConfiguration: {
        vectorSearchConfiguration: {
          numberOfResults,
          overrideSearchType: "HYBRID", // Combines semantic + keyword search
        },
      },
    };

    // Add metadata filters if provided
    if (config.filterCriteria && Object.keys(config.filterCriteria).length > 0) {
      // Note: Bedrock KB filters use specific syntax - adjust as needed
      // This is a placeholder for future filter implementation
      console.log("Filters requested but not yet implemented:", config.filterCriteria);
    }

    const url = `${bedrockAgentRuntimeBaseUrl}/knowledgebases/${knowledgeBaseId}/retrieve`;
    console.log("[RAG] Request URL:", url);
    console.log("[RAG] Request body:", JSON.stringify(requestBody, null, 2));

    const response = await bedrockAgentClient!.fetch(url, {
      method: "POST", // AWS Bedrock Agent Runtime retrieve uses POST, not PUT
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    console.log("[RAG] Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[RAG] Full error response:`, errorText);
      console.error(`Bedrock KB retrieval failed (${response.status}): ${errorText}`);
      return [];
    }

    const data = await response.json();

    // Parse retrieval results
    const results: RAGResult[] = (data.retrievalResults ?? []).map((result: any) => {
      const content = result.content?.text ?? "";
      const score = result.score;
      const metadata = result.metadata ?? {};
      const location = result.location
        ? {
            s3Key: result.location.s3Location?.uri,
            type: result.location.type,
          }
        : undefined;

      return {
        content,
        score,
        metadata,
        location,
      };
    });

    console.log(`Retrieved ${results.length} chunks from Knowledge Base for query: "${query.slice(0, 50)}..."`);

    return results;
  } catch (error) {
    console.error("Error retrieving from Knowledge Base:", error);
    return [];
  }
}

/**
 * Format RAG results into a context string for LLM prompts
 *
 * @param results - RAG retrieval results
 * @param maxChunks - Maximum number of chunks to include
 * @returns Formatted context string
 */
export function formatRAGContext(results: RAGResult[], maxChunks: number = 8): string {
  if (results.length === 0) {
    return "";
  }

  const chunks = results
    .slice(0, maxChunks)
    .filter((r) => r.content && r.content.trim().length > 0)
    .map((r, index) => {
      const header = `[Knowledge Base Context ${index + 1}${r.score ? ` - Score: ${r.score.toFixed(3)}` : ""}]`;
      return `${header}\n${r.content.trim()}`;
    });

  if (chunks.length === 0) {
    return "";
  }

  return `\n\n==== RELEVANT PATTERNS FROM KNOWLEDGE BASE ====\n\n${chunks.join("\n\n---\n\n")}\n\n==== END KNOWLEDGE BASE CONTEXT ====\n`;
}

/**
 * Build a RAG-enhanced query for agent type specific retrieval
 *
 * @param agentType - Type of agent (e.g., "Commercial Real Estate Investor")
 * @param focus - Specific focus areas (e.g., ["closing", "objection handling"])
 * @returns Query string optimized for relevant retrieval
 */
export function buildAgentTypeQuery(agentType: string, focus: string[] = []): string {
  const focusText = focus.length > 0 ? ` focusing on ${focus.join(", ")}` : "";
  return `Best practices, proven techniques, and anti-patterns for ${agentType} AI voice agents${focusText}. Include: successful closing techniques, natural conversation flow patterns, common mistakes to avoid, things that hurt performance, robotic patterns to eliminate, and high-performing prompt structures.`;
}

/**
 * Build a RAG query for refinement based on feedback
 *
 * @param issues - Specific issues identified (e.g., ["too verbose", "weak closing"])
 * @param agentCategory - General agent category (e.g., "cold_call")
 * @returns Query string for finding improvement patterns
 */
export function buildRefinementQuery(issues: string[], agentCategory?: string): string {
  const issuesText = issues.join(", ");
  const categoryText = agentCategory ? ` for ${agentCategory} agents` : "";
  return `How to fix these issues in AI voice agent prompts${categoryText}: ${issuesText}. Include anti-patterns to avoid and improvement strategies.`;
}

/**
 * Check if Knowledge Base is configured and accessible
 *
 * @returns True if KB is ready to use
 */
export function isKnowledgeBaseAvailable(): boolean {
  return hasKBConfigured;
}

/**
 * Check if Knowledge Base ingestion (for syncing new documents) is configured
 */
export function isKnowledgeBaseIngestionAvailable(): boolean {
  return hasKBIngestionConfigured;
}

/**
 * Get Knowledge Base configuration info
 *
 * @returns Configuration details for debugging
 */
export function getKBConfig() {
  return {
    configured: hasKBConfigured,
    knowledgeBaseId: knowledgeBaseId ? knowledgeBaseId.slice(0, 8) + "..." : "not set",
    region: region || "not set",
    hasCredentials: Boolean(accessKeyId && secretAccessKey),
    dataSourceId: knowledgeBaseDataSourceId ? knowledgeBaseDataSourceId.slice(0, 8) + "..." : "not set",
  };
}

/**
 * Format split RAG contexts with clear section headers
 *
 * This enables targeted RAG retrieval where different queries fetch different
 * types of knowledge (principles, examples, patterns, anti-patterns) for
 * balanced and purposeful context injection.
 *
 * @param contexts - Object containing 4 split context strings
 * @returns Object with formatted sections ready for prompt injection
 */
export function formatSplitRAGContext(contexts: {
  quality_principles: string;
  gold_examples: string;
  positive_patterns: string;
  anti_patterns: string;
}): Record<string, string> {
  return {
    quality_principles: contexts.quality_principles
      ? `## UNIVERSAL QUALITY PRINCIPLES\n\n${contexts.quality_principles}`
      : "## UNIVERSAL QUALITY PRINCIPLES\n\n(RAG retrieval returned no results - using baseline guidance)",

    gold_examples: contexts.gold_examples
      ? `## GOLD STANDARD EXAMPLES\n\nThe following are complete, proven prompts that work exceptionally well:\n\n${contexts.gold_examples}`
      : "## GOLD STANDARD EXAMPLES\n\n(No gold standard examples found yet for this agent type - will improve as high-quality prompts are added to Knowledge Base)",

    positive_patterns: contexts.positive_patterns
      ? `## SUCCESSFUL PATTERNS & TECHNIQUES\n\n${contexts.positive_patterns}`
      : "## SUCCESSFUL PATTERNS & TECHNIQUES\n\n(Growing through feedback loop - patterns will accumulate as agents are tested and refined)",

    anti_patterns: contexts.anti_patterns
      ? `## ANTI-PATTERNS TO AVOID\n\n${contexts.anti_patterns}`
      : "## ANTI-PATTERNS TO AVOID\n\n(Will accumulate through feedback analysis - critic LLM identifies structural issues)"
  };
}

/**
 * Start an ingestion job so newly uploaded S3 documents are indexed
 */
export async function startKnowledgeBaseIngestion(): Promise<{
  jobId: string;
  status: string;
} | null> {
  if (!hasKBIngestionConfigured) {
    console.warn("[RAG] Knowledge Base ingestion is not configured. Skipping ingestion job.");
    return null;
  }

  if (!bedrockAgentControlBaseUrl) {
    console.error("[RAG] Control endpoint unavailable. Check AWS region configuration.");
    return null;
  }

  try {
    const clientToken = crypto.randomUUID();
    const url = `${bedrockAgentControlBaseUrl}/knowledgebases/${knowledgeBaseId}/datasources/${knowledgeBaseDataSourceId}/ingestionjobs/`;

    const response = await bedrockAgentClient!.fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ clientToken }),
    });

    console.log("[RAG] Start ingestion response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[RAG] Failed to start ingestion job: ${errorText}`);
      return null;
    }

    const data = await response.json();
    const ingestionJob = data.ingestionJob ?? data;

    const jobId: string | undefined = ingestionJob?.ingestionJobId ?? ingestionJob?.jobId;
    const status: string | undefined = ingestionJob?.status;

    if (!jobId) {
      console.error("[RAG] Ingestion job response missing jobId:", data);
      return null;
    }

    console.log(`[RAG] Ingestion job started (id=${jobId}, status=${status})`);
    return { jobId, status: status ?? "UNKNOWN" };
  } catch (error) {
    console.error("[RAG] Error starting ingestion job:", error);
    return null;
  }
}

/**
 * Poll ingestion job status until completion or timeout
 */
export async function waitForIngestionJobCompletion(
  jobId: string,
  options: {
    pollIntervalMs?: number;
    timeoutMs?: number;
  } = {}
): Promise<{
  jobId: string;
  status: string;
  finished: boolean;
}> {
  const pollIntervalMs = options.pollIntervalMs ?? 5000;
  const timeoutMs = options.timeoutMs ?? 120_000; // 2 minutes by default

  if (!hasKBIngestionConfigured) {
    console.warn("[RAG] Knowledge Base ingestion is not configured. Cannot poll ingestion job.");
    return { jobId, status: "NOT_CONFIGURED", finished: false };
  }

  if (!bedrockAgentControlBaseUrl) {
    console.error("[RAG] Control endpoint unavailable. Cannot poll ingestion job status.");
    return { jobId, status: "ENDPOINT_UNAVAILABLE", finished: false };
  }

  const startTime = Date.now();
  const url = `${bedrockAgentControlBaseUrl}/knowledgebases/${knowledgeBaseId}/datasources/${knowledgeBaseDataSourceId}/ingestionjobs/${jobId}`;

  const terminalStatuses = new Set(["COMPLETE", "FAILED", "CANCELED", "STOPPED"]);

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await bedrockAgentClient!.fetch(url, { method: "GET" });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[RAG] Failed to fetch ingestion job status (${jobId}): ${errorText}`);
        return { jobId, status: "ERROR", finished: false };
      }

      const data = await response.json();
      const ingestionJob = data.ingestionJob ?? data;
      const status: string = ingestionJob?.status ?? "UNKNOWN";

      console.log(`[RAG] Ingestion job ${jobId} status: ${status}`);

      if (terminalStatuses.has(status)) {
        return { jobId, status, finished: status === "COMPLETE" };
      }
    } catch (error) {
      console.error(`[RAG] Error polling ingestion job ${jobId}:`, error);
      return { jobId, status: "ERROR", finished: false };
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  console.warn(`[RAG] Ingestion job ${jobId} timed out after ${timeoutMs}ms`);
  return { jobId, status: "TIMEOUT", finished: false };
}

/**
 * Convenience helper to start and wait for an ingestion job
 */
export async function syncKnowledgeBase(): Promise<{
  success: boolean;
  jobId?: string;
  status?: string;
}> {
  const startResult = await startKnowledgeBaseIngestion();

  if (!startResult) {
    return { success: false };
  }

  const completion = await waitForIngestionJobCompletion(startResult.jobId);
  const success = completion.finished;

  if (success) {
    console.log(`[RAG] Ingestion job ${completion.jobId} completed successfully.`);
  } else {
    console.warn(`[RAG] Ingestion job ${completion.jobId} finished with status ${completion.status}`);
  }

  return {
    success,
    jobId: completion.jobId,
    status: completion.status,
  };
}
