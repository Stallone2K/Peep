import {
  getAIClient,
  DEFAULT_MODEL,
  MAX_OUTPUT_TOKENS,
  MAX_INPUT_CHARS,
} from "@/server/ai/client";
import { BRANDING_SYSTEM_PROMPT } from "@/server/ai/prompts";
import { parseJsonFromResponse } from "@/server/ai/extract";

export type BrandingResult = {
  branding: Record<string, unknown>;
  tokensUsed?: { input: number; output: number };
};

// Extract brand identity information from page content.
// Returns colors, fonts, typography, UI components, brand name, tagline.
export async function extractBranding({
  markdown,
  rawHtml,
}: {
  markdown: string;
  rawHtml?: string;
}): Promise<BrandingResult> {
  const client = getAIClient();
  if (!client) throw new Error("AI client not configured (GROQ_API_KEY missing)");

  // For branding, we want both the markdown (content) and a slice of
  // raw HTML (for CSS class names, inline styles, font references).
  const mdTruncated = markdown.slice(0, MAX_INPUT_CHARS / 2);
  const htmlSlice = rawHtml
    ? rawHtml.slice(0, MAX_INPUT_CHARS / 2)
    : "";

  const userMessage = [
    "<page_markdown>",
    mdTruncated,
    "</page_markdown>",
    htmlSlice ? "<page_html_head>" : null,
    htmlSlice ? htmlSlice : null,
    htmlSlice ? "</page_html_head>" : null,
  ]
    .filter(Boolean)
    .join("\n");

  const completion = await client.chat.completions.create({
    model: DEFAULT_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: 0,
    messages: [
      { role: "system", content: BRANDING_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  const parsed = parseJsonFromResponse(raw) as Record<string, unknown>;

  return {
    branding: parsed,
    tokensUsed: completion.usage
      ? {
          input: completion.usage.prompt_tokens ?? 0,
          output: completion.usage.completion_tokens ?? 0,
        }
      : undefined,
  };
}
