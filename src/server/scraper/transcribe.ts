import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ─── Speech-to-text engine abstraction ──────────────────────────────
// Two interchangeable backends, selected by env — mirrors the AI
// client's NVIDIA-vs-Gemini split:
//
//   1. "api"   — any OpenAI-compatible /audio/transcriptions endpoint.
//                Set WHISPER_API_KEY (+ optionally WHISPER_API_URL /
//                WHISPER_API_MODEL). Defaults target Groq's free
//                Whisper (fast, generous free tier). Works equally with
//                a self-hosted whisper server, Cloudflare, HF, etc.
//
//   2. "local" — a whisper.cpp binary on the box (truly unlimited /
//                offline). Set WHISPER_CPP_BIN (+ WHISPER_CPP_MODEL).
//
// If neither is configured the caller degrades gracefully (a typed
// "unavailable" hint), exactly like the AI formats do without a key.

export type TranscriptSegment = { start: number; end: number; text: string };

export type TranscriptionResult = {
  text: string;
  segments: TranscriptSegment[];
  language?: string;
  engine: string;
};

export type TranscribeEngine = "api" | "local" | null;

// Whisper.cpp needs 16 kHz mono PCM WAV; hosted APIs happily take a
// compact mp3. The audio-acquisition step reads this to pick its
// ffmpeg output format.
export type PreferredAudioFormat = "wav16k" | "mp3";

function apiMaxUploadBytes(): number {
  return Number(
    process.env.WHISPER_API_MAX_UPLOAD_BYTES ?? String(24 * 1024 * 1024),
  );
}

export function transcribeEngine(): TranscribeEngine {
  if (process.env.WHISPER_API_KEY) return "api";
  if (process.env.WHISPER_CPP_BIN) return "local";
  return null;
}

export function isTranscriptionConfigured(): boolean {
  return transcribeEngine() !== null;
}

export function preferredAudioFormat(): PreferredAudioFormat {
  return transcribeEngine() === "local" ? "wav16k" : "mp3";
}

// Transcribe a local audio file. `language` is an optional ISO-639-1
// hint ("en") that skips Whisper's auto-detect. Throws on any engine
// error; the caller decides whether that's fatal or a soft-fail.
export async function transcribeAudioFile(
  audioPath: string,
  opts: { language?: string } = {},
): Promise<TranscriptionResult> {
  const engine = transcribeEngine();
  if (engine === "api") return transcribeViaApi(audioPath, opts);
  if (engine === "local") return transcribeViaWhisperCpp(audioPath, opts);
  throw new Error(
    "Transcription not configured (set WHISPER_API_KEY or WHISPER_CPP_BIN)",
  );
}

// ─── OpenAI-compatible API backend (Groq / CF / HF / self-host) ──────
async function transcribeViaApi(
  audioPath: string,
  opts: { language?: string },
): Promise<TranscriptionResult> {
  const baseUrl = (
    process.env.WHISPER_API_URL ?? "https://api.groq.com/openai/v1"
  ).replace(/\/$/, "");
  const model = process.env.WHISPER_API_MODEL ?? "whisper-large-v3-turbo";
  const key = process.env.WHISPER_API_KEY!;

  const bytes = await readFile(audioPath);
  const maxUpload = apiMaxUploadBytes();
  if (bytes.byteLength > maxUpload) {
    throw new Error(
      `Audio file ${bytes.byteLength} bytes exceeds the ${maxUpload}-byte upload cap for the transcription API (use the local whisper.cpp engine for large files)`,
    );
  }

  const form = new FormData();
  // Node's global Blob/FormData/fetch (Node 18+) send this as multipart.
  form.append(
    "file",
    new Blob([new Uint8Array(bytes)]),
    audioPath.split("/").pop() ?? "audio",
  );
  form.append("model", model);
  form.append("response_format", "verbose_json");
  if (opts.language) form.append("language", opts.language);

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Number(process.env.WHISPER_API_TIMEOUT_MS ?? "120000"),
  );
  try {
    const res = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      signal: controller.signal,
      headers: { authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Transcription API ${res.status}: ${body.slice(0, 300)}`,
      );
    }
    const data = (await res.json()) as {
      text?: string;
      language?: string;
      segments?: Array<{ start?: number; end?: number; text?: string }>;
    };
    const segments: TranscriptSegment[] = (data.segments ?? [])
      .map((s) => ({
        start: s.start ?? 0,
        end: s.end ?? 0,
        text: (s.text ?? "").trim(),
      }))
      .filter((s) => s.text);
    return {
      text: (data.text ?? "").trim(),
      segments,
      language: data.language,
      engine: `api:${model}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Local whisper.cpp backend ──────────────────────────────────────
async function transcribeViaWhisperCpp(
  audioPath: string,
  opts: { language?: string },
): Promise<TranscriptionResult> {
  const bin = process.env.WHISPER_CPP_BIN!;
  const model = process.env.WHISPER_CPP_MODEL;
  if (!model) {
    throw new Error(
      "WHISPER_CPP_MODEL must point at a ggml model file when using the local whisper.cpp engine",
    );
  }

  // -oj writes <audioPath>.json next to the input. execFile (not exec)
  // means args are passed as an argv array — no shell, no injection.
  const jsonOut = `${audioPath}.json`;
  const args = [
    "-m",
    model,
    "-f",
    audioPath,
    "-oj",
    "-of",
    audioPath,
    "-nt", // no timestamps in stdout; we read the json
  ];
  if (opts.language) args.push("-l", opts.language);

  try {
    await execFileAsync(bin, args, {
      timeout: Number(process.env.WHISPER_CPP_TIMEOUT_MS ?? "600000"),
      maxBuffer: 32 * 1024 * 1024,
    });
    const raw = await readFile(jsonOut, "utf8");
    const parsed = JSON.parse(raw) as {
      transcription?: Array<{
        offsets?: { from?: number; to?: number };
        text?: string;
      }>;
    };
    const segments: TranscriptSegment[] = (parsed.transcription ?? [])
      .map((seg) => ({
        // whisper.cpp offsets are milliseconds.
        start: (seg.offsets?.from ?? 0) / 1000,
        end: (seg.offsets?.to ?? 0) / 1000,
        text: (seg.text ?? "").trim(),
      }))
      .filter((s) => s.text);
    return {
      text: segments.map((s) => s.text).join(" ").trim(),
      segments,
      language: opts.language,
      engine: "local:whisper.cpp",
    };
  } finally {
    await rm(jsonOut, { force: true }).catch(() => {});
  }
}
