/**
 * S3 Pattern Writer Utility
 *
 * Writes learning patterns to S3 for ingestion by Bedrock Knowledge Base.
 * Patterns are stored as human-readable text documents with metadata.
 */

import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID") ?? "";
const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY") ?? "";
const sessionToken = Deno.env.get("AWS_SESSION_TOKEN") ?? undefined;
const region = Deno.env.get("AWS_REGION") ?? Deno.env.get("AWS_DEFAULT_REGION") ?? "";
const bucketName = Deno.env.get("S3_BUCKET_NAME") ?? "";
const kbPrefix = Deno.env.get("S3_KB_PREFIX") ?? "prompt-factory-kb";

const hasS3Configured = Boolean(bucketName && region && accessKeyId && secretAccessKey);

if (!hasS3Configured) {
  console.warn(
    "S3 not fully configured. Pattern writing will fail. " +
    "Set: S3_BUCKET_NAME, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
  );
}

const s3Client = hasS3Configured
  ? new AwsClient({
      accessKeyId,
      secretAccessKey,
      sessionToken,
      region,
      service: "s3",
    })
  : null;

export interface LearningPattern {
  id: string;
  pattern_type: string;
  agent_type_category?: string;
  pattern_summary: string;
  pattern_details: string;
  evidence_count: number;
  avg_rating_impact?: number;
  source_evaluation_ids?: string[];
}

export interface GoldenExample {
  agent_type: string;
  version: number;
  rating: number;
  base_prompt: string;
  states: unknown;
  generation_context?: unknown;
}

/**
 * Format a learning pattern as a human-readable document
 *
 * @param pattern - Learning pattern data
 * @returns Formatted text document
 */
function formatPatternDocument(pattern: LearningPattern): string {
  const {
    pattern_type,
    agent_type_category,
    pattern_summary,
    pattern_details,
    evidence_count,
    avg_rating_impact,
    source_evaluation_ids,
  } = pattern;

  const categoryText = agent_type_category ? `Agent Category: ${agent_type_category}` : "Agent Category: Universal";
  const impactText = avg_rating_impact !== undefined && avg_rating_impact !== null
    ? `Rating Impact: ${avg_rating_impact >= 0 ? "+" : ""}${avg_rating_impact.toFixed(2)} stars`
    : "Rating Impact: Not calculated";

  const evidenceText = `Evidence: ${evidence_count} evaluation${evidence_count === 1 ? "" : "s"}`;

  const sourceIds = source_evaluation_ids && source_evaluation_ids.length > 0
    ? `\n\nSource Evaluations: ${source_evaluation_ids.slice(0, 5).join(", ")}${source_evaluation_ids.length > 5 ? "..." : ""}`
    : "";

  return `Pattern Type: ${pattern_type}
${categoryText}
${impactText}
${evidenceText}

Summary:
${pattern_summary}

Details:
${pattern_details}${sourceIds}

---
Pattern ID: ${pattern.id}
Generated: ${new Date().toISOString()}
`;
}

/**
 * Format a golden example (high-rated prompt) as a document
 *
 * @param example - Golden example data
 * @returns Formatted text document
 */
function formatGoldenExampleDocument(example: GoldenExample): string {
  const { agent_type, version, rating, base_prompt, states, generation_context } = example;

  const contextText = generation_context
    ? `\n\nGeneration Context:\n${JSON.stringify(generation_context, null, 2)}`
    : "";

  return `Agent Type: ${agent_type}
Version: ${version}
Rating: ${rating}/5 stars (HIGH PERFORMING)

This is a proven, high-quality prompt that has been tested and achieved excellent results.
Use this as reference when generating similar agent types.

=== BASE PROMPT ===

${base_prompt}

=== STATES ===

${JSON.stringify(states, null, 2)}${contextText}

---
Generated: ${new Date().toISOString()}
`;
}

/**
 * Write a learning pattern to S3
 *
 * @param pattern - Learning pattern to write
 * @returns S3 key where pattern was written, or null on failure
 */
export async function writeLearningPattern(pattern: LearningPattern): Promise<string | null> {
  if (!hasS3Configured) {
    console.error("S3 not configured. Cannot write learning pattern.");
    return null;
  }

  try {
    const subfolder = `${kbPrefix}/patterns`;
    const sanitizedType = pattern.pattern_type.replace(/[^a-z0-9_-]/gi, "_");
    const filename = `${pattern.id}_${sanitizedType}.txt`;
    const s3Key = `${subfolder}/${filename}`;

    const document = formatPatternDocument(pattern);

    const url = `https://${bucketName}.s3.${region}.amazonaws.com/${s3Key}`;

    const response = await s3Client!.fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
      body: document,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to write pattern to S3 (${response.status}): ${errorText}`);
      return null;
    }

    console.log(`Learning pattern written to S3: ${s3Key}`);
    return s3Key;
  } catch (error) {
    console.error("Error writing learning pattern to S3:", error);
    return null;
  }
}

/**
 * Write a golden example (high-rated prompt) to S3
 *
 * @param example - Golden example to write
 * @returns S3 key where example was written, or null on failure
 */
export async function writeGoldenExample(example: GoldenExample): Promise<string | null> {
  if (!hasS3Configured) {
    console.error("S3 not configured. Cannot write golden example.");
    return null;
  }

  try {
    const subfolder = `${kbPrefix}/golden-examples`;
    const sanitizedAgentType = example.agent_type.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
    const filename = `${sanitizedAgentType}_v${example.version}_${example.rating}star.txt`;
    const s3Key = `${subfolder}/${filename}`;

    const document = formatGoldenExampleDocument(example);

    const url = `https://${bucketName}.s3.${region}.amazonaws.com/${s3Key}`;

    const response = await s3Client!.fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
      body: document,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to write golden example to S3 (${response.status}): ${errorText}`);
      return null;
    }

    console.log(`Golden example written to S3: ${s3Key}`);
    return s3Key;
  } catch (error) {
    console.error("Error writing golden example to S3:", error);
    return null;
  }
}

/**
 * Write a meta-pattern document (weekly batch analysis)
 *
 * @param content - Meta-pattern content
 * @param dateStr - Date string for filename (YYYY-MM-DD)
 * @returns S3 key where meta-pattern was written, or null on failure
 */
export async function writeMetaPattern(content: string, dateStr: string): Promise<string | null> {
  if (!hasS3Configured) {
    console.error("S3 not configured. Cannot write meta-pattern.");
    return null;
  }

  try {
    const subfolder = `${kbPrefix}/meta-patterns`;
    const filename = `weekly_analysis_${dateStr}.txt`;
    const s3Key = `${subfolder}/${filename}`;

    const url = `https://${bucketName}.s3.${region}.amazonaws.com/${s3Key}`;

    const response = await s3Client!.fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
      body: content,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to write meta-pattern to S3 (${response.status}): ${errorText}`);
      return null;
    }

    console.log(`Meta-pattern written to S3: ${s3Key}`);
    return s3Key;
  } catch (error) {
    console.error("Error writing meta-pattern to S3:", error);
    return null;
  }
}

/**
 * Delete a pattern from S3 (cleanup)
 *
 * @param s3Key - Full S3 key to delete
 * @returns True if successful
 */
export async function deletePattern(s3Key: string): Promise<boolean> {
  if (!hasS3Configured) {
    console.error("S3 not configured. Cannot delete pattern.");
    return false;
  }

  try {
    const url = `https://${bucketName}.s3.${region}.amazonaws.com/${s3Key}`;

    const response = await s3Client!.fetch(url, {
      method: "DELETE",
    });

    if (!response.ok && response.status !== 404) {
      const errorText = await response.text();
      console.error(`Failed to delete pattern from S3 (${response.status}): ${errorText}`);
      return false;
    }

    console.log(`Pattern deleted from S3: ${s3Key}`);
    return true;
  } catch (error) {
    console.error("Error deleting pattern from S3:", error);
    return false;
  }
}

/**
 * Check if S3 is configured and accessible
 *
 * @returns True if S3 is ready to use
 */
export function isS3Available(): boolean {
  return hasS3Configured;
}

/**
 * Get S3 configuration info
 *
 * @returns Configuration details for debugging
 */
export function getS3Config() {
  return {
    configured: hasS3Configured,
    bucketName: bucketName || "not set",
    region: region || "not set",
    kbPrefix,
    hasCredentials: Boolean(accessKeyId && secretAccessKey),
  };
}
