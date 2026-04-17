import Ajv from "ajv";
import addFormats from "ajv-formats";

import {
  getAIClient,
  DEFAULT_MODEL,
  MAX_OUTPUT_TOKENS,
  MAX_INPUT_CHARS,
} from "@/server/ai/client";
import { EXTRACTION_SYSTEM_PROMPT } from "@/server/ai/prompts";

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

export type ExtractionResult = {
  data: unknown;
  tokensUsed?: { input: number; output: number };
};

// Schema-based extraction. Takes page markdown + a JSON Schema,
// returns extracted data validated against the schema.
export async function extractStructured({
  markdown,
  schema,
  prompt,
  systemPrompt,
}: {
  markdown: string;
  schema: Record<string, unknown>;
  prompt?: string;
  systemPrompt?: string;
}): Promise<ExtractionResult> {
  const client = getAIClient();
  if (!client) throw new Error("AI client not configured (GROQ_API_KEY missing)");

  const truncated = markdown.slice(0, MAX_INPUT_CHARS);

  const userMessage = [
    `<schema>${JSON.stringify(schema)}</schema>`,
    prompt ? `<instruction>${prompt}</instruction>` : null,
    `<page>${truncated}</page>`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const completion = await client.chat.completions.create({
    model: DEFAULT_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt || EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  const parsed = parseJsonFromResponse(raw);

  // Validate against the user's schema
  const validate = ajv.compile(schema);
  if (!validate(parsed)) {
    throw new ExtractionValidationError(validate.errors);
  }

  return {
    data: parsed,
    tokensUsed: completion.usage
      ? {
          input: completion.usage.prompt_tokens ?? 0,
          output: completion.usage.completion_tokens ?? 0,
        }
      : undefined,
  };
}

// Extract JSON from an LLM response that might be wrapped in markdown
// fences or have leading text.
export function parseJsonFromResponse(raw: string): unknown {
  let cleaned = raw.trim();

  // Strip markdown fences
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1]!.trim();
  }

  // Strip leading text before the first { or [
  const firstBrace = cleaned.indexOf("{");
  const firstBracket = cleaned.indexOf("[");
  const start = Math.min(
    firstBrace >= 0 ? firstBrace : Infinity,
    firstBracket >= 0 ? firstBracket : Infinity,
  );
  if (start !== Infinity) {
    cleaned = cleaned.slice(start);
  }

  // Strip trailing text after the last } or ]
  const lastBrace = cleaned.lastIndexOf("}");
  const lastBracket = cleaned.lastIndexOf("]");
  const end = Math.max(lastBrace, lastBracket);
  if (end >= 0) {
    cleaned = cleaned.slice(0, end + 1);
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(
      `Failed to parse JSON from AI response. Raw output: ${raw.slice(0, 500)}`,
    );
  }
}

export class ExtractionValidationError extends Error {
  readonly code = "EXTRACTION_SCHEMA_MISMATCH";
  readonly status = 422;
  readonly details: unknown;

  constructor(errors: unknown) {
    super("Extracted data does not match the provided schema");
    this.name = "ExtractionValidationError";
    this.details = errors;
  }
}
