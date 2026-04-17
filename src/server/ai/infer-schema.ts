import {
  getAIClient,
  DEFAULT_MODEL,
  MAX_OUTPUT_TOKENS,
  MAX_INPUT_CHARS,
} from "@/server/ai/client";
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
  const client = getAIClient();
  if (!client) throw new Error("AI client not configured (GROQ_API_KEY missing)");

  const truncated = markdown.slice(0, MAX_INPUT_CHARS);

  const userMessage = [
    `<instruction>${prompt}</instruction>`,
    `<page>${truncated}</page>`,
  ].join("\n\n");

  const completion = await client.chat.completions.create({
    model: DEFAULT_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: 0,
    messages: [
      { role: "system", content: SCHEMA_FREE_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  const parsed = parseJsonFromResponse(raw) as {
    schema?: Record<string, unknown>;
    data?: unknown;
  };

  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI returned invalid shape for schema inference");
  }

  return {
    schema: (parsed.schema as Record<string, unknown>) ?? {},
    data: parsed.data ?? null,
    tokensUsed: completion.usage
      ? {
          input: completion.usage.prompt_tokens ?? 0,
          output: completion.usage.completion_tokens ?? 0,
        }
      : undefined,
  };
}
