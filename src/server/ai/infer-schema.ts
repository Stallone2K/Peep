import { MAX_INPUT_CHARS, generateAI } from "@/server/ai/client";
import { SCHEMA_FREE_SYSTEM_PROMPT } from "@/server/ai/prompts";
import { parseJsonFromResponse } from "@/server/ai/extract";

export type InferResult = {
  schema: Record<string, unknown>;
  data: unknown;
  tokensUsed?: { input: number; output: number };
};

// Schema-free extraction. The user provides only a natural-language
// prompt ("extract the pricing tiers"). The LLM infers both an
// appropriate JSON Schema AND the matching data from the page content.
// Callers can lock in the returned schema for subsequent calls.
export async function inferSchemaAndExtract({
  markdown,
  prompt,
}: {
  markdown: string;
  prompt: string;
}): Promise<InferResult> {
  const truncated = markdown.slice(0, MAX_INPUT_CHARS);

  const userMessage = [
    `<instruction>${prompt}</instruction>`,
    `<page>${truncated}</page>`,
  ].join("\n\n");

  const { text, usage } = await generateAI({
    systemPrompt: SCHEMA_FREE_SYSTEM_PROMPT,
    userMessage,
    temperature: 0,
  });

  const parsed = parseJsonFromResponse(text) as {
    schema?: Record<string, unknown>;
    data?: unknown;
  };

  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI returned invalid shape for schema inference");
  }

  return {
    schema: (parsed.schema as Record<string, unknown>) ?? {},
    data: parsed.data ?? null,
    tokensUsed: usage,
  };
}
