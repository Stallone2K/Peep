import { MAX_INPUT_CHARS, generateAI } from "@/server/ai/client";
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

  const { text, usage } = await generateAI({
    systemPrompt: BRANDING_SYSTEM_PROMPT,
    userMessage,
    temperature: 0,
  });

  const parsed = parseJsonFromResponse(text) as Record<string, unknown>;

  return { branding: parsed, tokensUsed: usage };
}
