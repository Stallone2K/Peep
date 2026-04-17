import { MAX_INPUT_CHARS, generateAI } from "@/server/ai/client";
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
  const truncated = markdown.slice(0, MAX_INPUT_CHARS);

  // Summary is prose — disable JSON response mime so Gemini doesn't
  // wrap it in a JSON string.
  const { text, usage } = await generateAI({
    systemPrompt: SUMMARY_SYSTEM_PROMPT,
    userMessage: truncated,
    temperature: 0.3,
    expectJson: false,
  });

  return { summary: text.trim(), tokensUsed: usage };
}
