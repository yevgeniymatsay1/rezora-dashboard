import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID") ?? "";
const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY") ?? "";
const sessionToken = Deno.env.get("AWS_SESSION_TOKEN") ?? undefined;
const region = Deno.env.get("AWS_REGION")
  ?? Deno.env.get("AWS_DEFAULT_REGION")
  ?? "";
const modelId =
  Deno.env.get("AWS_BEDROCK_MODEL")
  ?? "anthropic.claude-3-5-sonnet-20240620-v1:0";
const inferenceProfile =
  Deno.env.get("AWS_BEDROCK_INFERENCE_PROFILE_ARN")
  ?? Deno.env.get("AWS_BEDROCK_INFERENCE_PROFILE_ID")
  ?? null;

if (!region) {
  console.error("Missing AWS region for Bedrock.");
}

const useSigV4 = true;
const hasSigV4Creds = Boolean(accessKeyId && secretAccessKey);

const bedrockClient = useSigV4
  ? new AwsClient({
      accessKeyId,
      secretAccessKey,
      sessionToken,
      region,
      service: "bedrock",
    })
  : null;

const basePath = `/model/${encodeURIComponent(modelId)}/invoke`;
const BEDROCK_URL = `https://bedrock-runtime.${region}.amazonaws.com${basePath}`;

if (inferenceProfile) {
  console.log(
    `Bedrock LLM configured: model=${modelId}, inference_profile=${inferenceProfile}, url=${BEDROCK_URL}`,
  );
} else {
  console.log(`Bedrock LLM configured: model=${modelId}, url=${BEDROCK_URL}`);
}
const ANTHROPIC_VERSION = "bedrock-2023-05-31";

export function getLLMConfigurationError(): string | null {
  if (!region) {
    return "AWS_REGION (or AWS_DEFAULT_REGION) is not set.";
  }

  if (useSigV4) {
    if (!hasSigV4Creds) {
      return "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set.";
    }
  }

  return null;
}

async function invokeClaude(prompt: string, options: { temperature?: number; maxTokens?: number } = {}) {
  const body = {
    anthropic_version: ANTHROPIC_VERSION,
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.2,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt,
          },
        ],
      },
    ],
  };

  if (useSigV4) {
    if (!bedrockClient) {
      throw new Error("AWS Bedrock credentials are not configured.");
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (inferenceProfile) {
      const headerKey = inferenceProfile.startsWith("arn:")
        ? "X-Amzn-Bedrock-Inference-Profile-Arn"
        : "X-Amzn-Bedrock-Inference-Profile-Id";
      headers[headerKey] = inferenceProfile;
      console.log(`Invoking Bedrock with inference profile header ${headerKey}`);
    }

    const response = await bedrockClient.fetch(BEDROCK_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Bedrock invoke failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const output = extractAnthropicText(data);

    if (!output) {
      console.error("Bedrock response missing text output:", JSON.stringify(data));
      throw new Error("Bedrock response did not contain text output.");
    }

    return output;
  }

  throw new Error("Bedrock invocation is misconfigured: SigV4 credentials are required.");
}

export const LLM = {
  async generate(
    prompt: string,
    options: { maxTokens?: number; temperature?: number } = {},
  ) {
    return invokeClaude(prompt, {
      temperature: options.temperature ?? 0.2,
      maxTokens: options.maxTokens ?? 2048,
    });
  },

  async generateJSON(prompt: string, options: { maxTokens?: number; temperature?: number } = {}) {
    const maxTokens = options.maxTokens ?? 4096;
    const temperature = options.temperature ?? 0.1;

    const text = await invokeClaude(
      `${prompt}\n\nReturn ONLY valid JSON with no extra text.`,
      { temperature, maxTokens },
    );

    // Strip markdown code fences if present
    let cleanedText = text.trim();
    if (cleanedText.startsWith("```json")) {
      cleanedText = cleanedText.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    } else if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }

    try {
      return JSON.parse(cleanedText);
    } catch (error) {
      console.error("Failed to parse JSON output from LLM:", text);
      throw new Error(
        `LLM returned invalid JSON: ${(error as Error).message}`,
      );
    }
  },
};

function extractAnthropicText(data: any): string | null {
  const direct =
    data?.content?.[0]?.text
    ?? data?.output?.[0]?.content?.[0]?.text
    ?? data?.output_text;

  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct.trim();
  }

  const contentText = extractTextContent(data?.content);
  if (contentText) return contentText;

  const outputText = extractTextContent(data?.output?.[0]?.content);
  if (outputText) return outputText;

  const responseText = extractTextContent(data?.response?.content);
  if (responseText) return responseText;

  return null;
}

function extractTextContent(content: any): string | null {
  if (!content) return null;

  if (typeof content === "string") {
    return content.trim().length > 0 ? content.trim() : null;
  }

  if (Array.isArray(content)) {
    const parts = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        if (typeof part?.value === "string") return part.value;
        return null;
      })
      .filter((part): part is string => Boolean(part && part.trim().length > 0));

    if (parts.length > 0) {
      return parts.join("\n").trim();
    }
  }

  if (typeof content === "object") {
    const maybeText = content.text ?? content.value ?? content.output_text;
    if (typeof maybeText === "string" && maybeText.trim().length > 0) {
      return maybeText.trim();
    }
  }

  return null;
}
