import { GoogleGenAI } from "@google/genai";

// AI provider abstraction. Prefers NVIDIA NIM (free, OpenAI-compatible,
// `nvapi-` key, ~40 rpm) when NVIDIA_API_KEY is set, otherwise Gemini. If
// neither is configured the client reports "not configured" and AI formats
// degrade gracefully (typed "unavailable" hint) instead of throwing.

type Provider = "nvidia" | "gemini" | null;

function provider(): Provider {
  if (process.env.NVIDIA_API_KEY) return "nvidia";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return null;
}

// Output budget + input truncation (free tiers are rate/token limited).
export const MAX_OUTPUT_TOKENS = 4096;
export const MAX_INPUT_CHARS = 20_000;

// Gemini model (when the Gemini provider is active).
export const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

// NVIDIA NIM — OpenAI-compatible endpoint + a strong, JSON-friendly free model.
const NVIDIA_BASE_URL =
  process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
const NVIDIA_MODEL = process.env.NVIDIA_MODEL ?? "meta/llama-3.3-70b-instruct";

export function isAIConfigured(): boolean {
  return provider() !== null;
}

// ─── Gemini client (lazy singleton) ─────────────────────────────────
let _gemini: GoogleGenAI | null = null;
let _checked = false;

export function getAIClient(): GoogleGenAI | null {
  if (_checked) return _gemini;
  _checked = true;
  const key = process.env.GEMINI_API_KEY;
  if (key) _gemini = new GoogleGenAI({ apiKey: key });
  return _gemini;
}

type GenOpts = {
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  expectJson?: boolean;
};

type GenResult = {
  text: string;
  usage: { input: number; output: number } | undefined;
};

// Shared wrapper so each AI module doesn't repeat provider plumbing.
export async function generateAI(opts: GenOpts): Promise<GenResult> {
  const p = provider();
  if (p === "nvidia") return generateNvidia(opts);
  if (p === "gemini") return generateGemini(opts);
  throw new Error(
    "AI client not configured (set NVIDIA_API_KEY or GEMINI_API_KEY)",
  );
}

// ─── NVIDIA NIM (OpenAI-compatible /chat/completions) ────────────────
async function generateNvidia(opts: GenOpts): Promise<GenResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: NVIDIA_MODEL,
        messages: [
          { role: "system", content: opts.systemPrompt },
          { role: "user", content: opts.userMessage },
        ],
        temperature: opts.temperature ?? 0,
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`NVIDIA API ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: data.choices?.[0]?.message?.content ?? "",
      usage: data.usage
        ? {
            input: data.usage.prompt_tokens ?? 0,
            output: data.usage.completion_tokens ?? 0,
          }
        : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Gemini (@google/genai) ──────────────────────────────────────────
async function generateGemini(opts: GenOpts): Promise<GenResult> {
  const client = getAIClient();
  if (!client) {
    throw new Error("AI client not configured (GEMINI_API_KEY missing)");
  }

  const response = await client.models.generateContent({
    model: DEFAULT_MODEL,
    contents: opts.userMessage,
    config: {
      systemInstruction: opts.systemPrompt,
      temperature: opts.temperature ?? 0,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      ...(opts.expectJson !== false
        ? { responseMimeType: "application/json" }
        : {}),
    },
  });

  const meta = response.usageMetadata;
  return {
    text: response.text ?? "",
    usage: meta
      ? {
          input: meta.promptTokenCount ?? 0,
          output: meta.candidatesTokenCount ?? 0,
        }
      : undefined,
  };
}
