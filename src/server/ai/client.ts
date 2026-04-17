import Groq from "groq-sdk";

// Singleton Groq client. We use Groq's free tier with Llama 3.3 70B
// for all AI operations (extraction, summary, branding). Groq is
// OpenAI-compatible so swapping to Claude/OpenAI later is a one-line
// model change + env-var swap.
//
// If GROQ_API_KEY is missing, the client is null and AI format
// requests will return typed "unavailable" errors.

let _client: Groq | null = null;
let _checked = false;

export function getAIClient(): Groq | null {
  if (_checked) return _client;
  _checked = true;

  const key = process.env.GROQ_API_KEY;
  if (!key) {
    console.warn("[ai] GROQ_API_KEY not set — AI formats will be unavailable");
    return null;
  }

  _client = new Groq({ apiKey: key });
  return _client;
}

// Default model — Llama 3.3 70B on Groq (fast, free, good for extraction)
export const DEFAULT_MODEL = "llama-3.3-70b-versatile";

// Max tokens budget per call
export const MAX_OUTPUT_TOKENS = 4096;

// Truncate input markdown to this many characters to stay within
// context limits. Llama 3.3 70B has 128K context but Groq free tier
// caps at ~6K tokens per request. 20K chars ≈ 5K tokens is safe.
export const MAX_INPUT_CHARS = 20_000;

export function isAIConfigured(): boolean {
  return !!process.env.GROQ_API_KEY;
}
