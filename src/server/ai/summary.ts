import {
  getAIClient,
  DEFAULT_MODEL,
  MAX_OUTPUT_TOKENS,
  MAX_INPUT_CHARS,
} from "@/server/ai/client";
import { SUMMARY_SYSTEM_PROMPT } from "@/server/ai/prompts";

export type SummaryResult = {
  summary: string;
  tokensUsed?: { input: number; output: number };
};

// Generate a 2-3 paragraph summary of a page from its markdown.
export async function generateSummary({
  markdown,
}: {
  markdown: string;
}): Promise<SummaryResult> {
  const client = getAIClient();
  if (!client) throw new Error("AI client not configured (GROQ_API_KEY missing)");

  const truncated = markdown.slice(0, MAX_INPUT_CHARS);

  const completion = await client.chat.completions.create({
    model: DEFAULT_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: 0.3,
    messages: [
      { role: "system", content: SUMMARY_SYSTEM_PROMPT },
      { role: "user", content: truncated },
    ],
  });

  const summary = completion.choices[0]?.message?.content?.trim() ?? "";

  return {
    summary,
    tokensUsed: completion.usage
      ? {
          input: completion.usage.prompt_tokens ?? 0,
          output: completion.usage.completion_tokens ?? 0,
        }
      : undefined,
  };
}
