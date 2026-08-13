import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { assertSafeUrl } from "@/server/scraper/ssrf";
import {
  isTranscriptionConfigured,
  preferredAudioFormat,
  transcribeAudioFile,
  type TranscriptSegment,
} from "@/server/scraper/transcribe";

const execFileAsync = promisify(execFile);

// ─── Audio scrape format ────────────────────────────────────────────
// Acquire the audio track from a URL (YouTube, any yt-dlp-supported
// site, or a direct audio/video file), then transcribe it to text.
//
// Acquisition is yt-dlp + ffmpeg (both must be on the box; paths are
// env-overridable). Transcription is the pluggable whisper engine.
//
// SSRF: yt-dlp does its own networking and bypasses our undici guard,
// so we validate the target with assertSafeUrl BEFORE handing it over.
// This blocks the obvious internal-target case (a direct media URL at a
// private IP). yt-dlp still follows its own redirects — a residual risk
// noted in SECURITY.md — so we also pass --no-playlist and duration /
// size ceilings to bound what a single call can pull.

const YT_DLP_BIN = process.env.YT_DLP_BIN ?? "yt-dlp";
const FFMPEG_BIN = process.env.FFMPEG_BIN ?? "ffmpeg";

// Hard ceilings so one request can't wedge the worker. Sync scrapes get
// the short cap; async scrapes (worker, no HTTP deadline) get the long
// one — same pattern as the YouTube comment budgets. Read at call-time
// so ops can retune via env without a rebuild.
function maxDurationSec(async: boolean): number {
  return async
    ? Number(process.env.AUDIO_MAX_DURATION_SEC_ASYNC ?? "14400") // 4 h
    : Number(process.env.AUDIO_MAX_DURATION_SEC ?? "1800"); // 30 min
}
function maxFilesize(): string {
  return process.env.AUDIO_MAX_FILESIZE ?? "200M";
}
function downloadTimeoutMs(): number {
  return Number(process.env.AUDIO_DOWNLOAD_TIMEOUT_MS ?? "180000");
}

export type AudioResult = {
  transcript: string;
  segments: TranscriptSegment[];
  language?: string;
  engine: string;
  source: string;
  durationSec?: number;
};

export function isAudioConfigured(): boolean {
  return isTranscriptionConfigured();
}

// Feature gate — the audio format is fully built but held as
// "Coming Soon" until this flag is flipped. While off, the format is
// still ACCEPTED (no 422 for SDK callers) but transcription never runs
// and NO credits are charged (see computeCredits) — so we don't
// recreate the billed-but-broken integrity bug. Flip to "true" to go
// live; then WHISPER_API_KEY / WHISPER_CPP_BIN selects the engine.
export function isAudioFormatEnabled(): boolean {
  return process.env.AUDIO_FORMAT_ENABLED === "true";
}

// Full audio pipeline for a URL: validate → probe duration → download
// + convert → transcribe → clean up. Throws on any failure; the caller
// decides whether to soft-fail (metadata hint) or propagate.
export async function transcribeUrlAudio(
  url: string,
  opts: { language?: string; async?: boolean } = {},
): Promise<AudioResult> {
  if (!isTranscriptionConfigured()) {
    throw new Error(
      "Audio transcription not configured (set WHISPER_API_KEY or WHISPER_CPP_BIN)",
    );
  }

  // SSRF guard before yt-dlp touches the network.
  await assertSafeUrl(url);

  const maxDuration = maxDurationSec(opts.async ?? false);

  // Cheap metadata probe (no download) to reject over-long media early.
  // Direct files often report no duration ("NA") — we let those through
  // and rely on the filesize + timeout ceilings instead.
  const duration = await probeDuration(url);
  if (duration !== null && duration > maxDuration) {
    throw new Error(
      `Audio is ${Math.round(duration)}s, over the ${maxDuration}s limit for this scrape mode (retry as an async scrape for the longer cap)`,
    );
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "peep-audio-"));
  try {
    const audioPath = await downloadAudio(url, workDir);
    const result = await transcribeAudioFile(audioPath, {
      language: opts.language,
    });
    return {
      transcript: result.text,
      segments: result.segments,
      language: result.language,
      engine: result.engine,
      source: url,
      durationSec: duration ?? undefined,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

// yt-dlp metadata-only duration probe. Returns seconds, or null when
// unknown/unavailable (direct files, live streams).
async function probeDuration(url: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      YT_DLP_BIN,
      [
        "--no-playlist",
        "--skip-download",
        "--no-warnings",
        "--print",
        "%(duration)s",
        url,
      ],
      { timeout: 30_000, maxBuffer: 1024 * 1024 },
    );
    const val = stdout.trim().split("\n")[0]?.trim();
    if (!val || val === "NA") return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  } catch {
    // A probe failure isn't fatal — the download step will surface a
    // real error if the URL is genuinely unfetchable.
    return null;
  }
}

// Download the best audio track and transcode to the engine's preferred
// format. Returns the path to the produced audio file.
async function downloadAudio(url: string, workDir: string): Promise<string> {
  const wantWav = preferredAudioFormat() === "wav16k";
  const audioFormat = wantWav ? "wav" : "mp3";
  const outTemplate = path.join(workDir, "audio.%(ext)s");

  const args = [
    "--no-playlist",
    "--no-warnings",
    "--no-progress",
    "-f",
    "bestaudio/best",
    "-x",
    "--audio-format",
    audioFormat,
    "--max-filesize",
    maxFilesize(),
    "--socket-timeout",
    "30",
    "--ffmpeg-location",
    FFMPEG_BIN,
    "-o",
    outTemplate,
  ];
  // whisper.cpp wants 16 kHz mono; hand ffmpeg the resample args.
  if (wantWav) {
    args.push("--postprocessor-args", "ffmpeg:-ar 16000 -ac 1");
  }
  args.push(url);

  await execFileAsync(YT_DLP_BIN, args, {
    timeout: downloadTimeoutMs(),
    maxBuffer: 8 * 1024 * 1024,
  });

  // yt-dlp names the file audio.<ext>; find it (extension can vary if a
  // postprocessor changed it).
  const files = await readdir(workDir);
  const produced = files.find((f) => f.startsWith("audio."));
  if (!produced) {
    throw new Error("Audio download produced no file");
  }
  return path.join(workDir, produced);
}
