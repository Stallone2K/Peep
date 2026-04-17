import { GoogleGenAI } from "@google/genai";

// Singleton Gemini client. The free tier of Gemini 2.5 Flash (15 RPM,
// 1M TPM, 1.5k RPD) is comfortably enough for private-alpha usage; we
// can flip to 2.5 Pro later for higher-quality extractions by bumping
// DEFAULT_MODEL via env.
//
// If GEMINI_API_KEY is missing the client is null and AI format
// requests return a typed "unavailable" hint in the scrape metadata
// rather than throwing — graceful degradation stays intact.

let _client: GoogleGenAI | null = null;
let _checked = false;

export function getAIClient(): GoogleGenAI | null {
  if (_checked) return _client;
  _checked = true;

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.warn(
      "[ai] GEMINI_API_KEY not set — AI formats will be unavailable",
    );
    return null;
  }

  _client = new GoogleGenAI({ apiKey: key });
  return _client;
}

// Default model — Gemini 2.5 Flash. Override via GEMINI_MODEL env if
// the caller wants Pro (quality) or Flash-Lite (cheaper).
export const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

// Max output tokens budget per call.
export const MAX_OUTPUT_TOKENS = 4096;

// Truncate input markdown to this many characters. Gemini 2.5 Flash
// has a 1M-token context window but the free tier is rate-limited on
// TPM, so keep requests cheap. 20K chars ≈ 5K tokens.
export const MAX_INPUT_CHARS = 20_000;

export function isAIConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

// Shared generateContent wrapper so each AI module doesn't have to
// repeat the client/config plumbing. Returns the raw text + usage
// counts so callers can log cache/token metrics.
export async function generateAI({
  systemPrompt,
  userMessage,
  temperature = 0,
  expectJson = true,
}: {
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  expectJson?: boolean;
}): Promise<{
  text: string;
  usage: { input: number; output: number } | undefined;
}> {
  const client = getAIClient();
  if (!client) {
    throw new Error("AI client not configured (GEMINI_API_KEY missing)");
  }

  const response = await client.models.generateContent({
    model: DEFAULT_MODEL,
    contents: userMessage,
    config: {
      systemInstruction: systemPrompt,
      temperature,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      ...(expectJson ? { responseMimeType: "application/json" } : {}),
    },
  });

  const text = response.text ?? "";
  const meta = response.usageMetadata;
  return {
    text,
    usage: meta
      ? {
          input: meta.promptTokenCount ?? 0,
          output: meta.candidatesTokenCount ?? 0,
        }
      : undefined,
  };
}
