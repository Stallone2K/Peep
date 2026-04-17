import { generateAI } from "@/server/ai/client";
import { parseJsonFromResponse } from "@/server/ai/extract";

// NL-to-crawl-config translator. Given a root URL + a plain-English
// description ("crawl the docs section, avoid changelogs"), Gemini
// returns a partial crawl config (includePaths/excludePaths regexes,
// limit, crawlEntireDomain). Caller merges this UNDER explicit fields
// so user-supplied values always win.

const SYSTEM_PROMPT = `You translate a natural-language crawl instruction into a JSON config for a web crawler.

You ALWAYS return valid JSON with this shape. Omit any field you cannot confidently infer:
{
  "includePaths": ["<regex string>"],
  "excludePaths": ["<regex string>"],
  "limit": <integer 1-50000>,
  "crawlEntireDomain": <boolean>,
  "allowSubdomains": <boolean>,
  "regexOnFullURL": <boolean>
}

RULES:
1. Return ONLY the JSON object — no prose, no fences.
2. Paths are regex strings, not globs. Anchor with ^ when you mean "starts with".
3. If the instruction is about a URL subsection, prefer "includePaths" over "crawlEntireDomain".
4. Be conservative — fewer fields is better than hallucinated fields.`;

export type CrawlConfigSuggestion = {
  includePaths?: string[];
  excludePaths?: string[];
  limit?: number;
  crawlEntireDomain?: boolean;
  allowSubdomains?: boolean;
  regexOnFullURL?: boolean;
};

export async function promptToCrawlConfig({
  rootUrl,
  prompt,
}: {
  rootUrl: string;
  prompt: string;
}): Promise<CrawlConfigSuggestion> {
  const userMessage = [
    `<root_url>${rootUrl}</root_url>`,
    `<instruction>${prompt}</instruction>`,
  ].join("\n\n");

  const { text } = await generateAI({
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    temperature: 0,
  });

  const parsed = parseJsonFromResponse(text) as CrawlConfigSuggestion;
  return sanitizeSuggestion(parsed);
}

// Drop any field that doesn't match the expected type. Gemini is
// usually well-behaved with the JSON mime, but a stray extra field or
// wrong type shouldn't poison the downstream crawl options.
function sanitizeSuggestion(
  raw: unknown,
): CrawlConfigSuggestion {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: CrawlConfigSuggestion = {};

  if (Array.isArray(r.includePaths)) {
    out.includePaths = r.includePaths.filter(
      (x): x is string => typeof x === "string",
    );
  }
  if (Array.isArray(r.excludePaths)) {
    out.excludePaths = r.excludePaths.filter(
      (x): x is string => typeof x === "string",
    );
  }
  if (typeof r.limit === "number" && r.limit > 0 && r.limit <= 50_000) {
    out.limit = Math.floor(r.limit);
  }
  if (typeof r.crawlEntireDomain === "boolean")
    out.crawlEntireDomain = r.crawlEntireDomain;
  if (typeof r.allowSubdomains === "boolean")
    out.allowSubdomains = r.allowSubdomains;
  if (typeof r.regexOnFullURL === "boolean")
    out.regexOnFullURL = r.regexOnFullURL;

  return out;
}
