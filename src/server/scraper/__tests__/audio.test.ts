import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────
const assertSafeUrlMock = vi.fn();
vi.mock("@/server/scraper/ssrf", () => ({
  assertSafeUrl: (...a: unknown[]) => assertSafeUrlMock(...a),
}));

const transcribeAudioFileMock = vi.fn();
let configured = true;
let format: "wav16k" | "mp3" = "mp3";
vi.mock("@/server/scraper/transcribe", () => ({
  isTranscriptionConfigured: () => configured,
  preferredAudioFormat: () => format,
  transcribeAudioFile: (...a: unknown[]) => transcribeAudioFileMock(...a),
}));

vi.mock("node:fs/promises", () => ({
  mkdtemp: vi.fn(async (p: string) => `${p}XXXX`),
  readdir: vi.fn(async () => ["audio.mp3"]),
  rm: vi.fn(async () => {}),
}));

const execFileMock = vi.fn();
vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => {
    const cb = args[args.length - 1] as (
      e: unknown,
      r?: { stdout: string; stderr: string },
    ) => void;
    execFileMock(...args.slice(0, -1))
      .then((r: { stdout: string; stderr: string }) => cb(null, r))
      .catch((e: unknown) => cb(e));
  },
}));

import { transcribeUrlAudio, isAudioConfigured } from "@/server/scraper/audio";

beforeEach(() => {
  assertSafeUrlMock.mockReset().mockResolvedValue({
    url: new URL("https://youtu.be/abc"),
    hostname: "youtu.be",
    address: "1.2.3.4",
    family: 4,
  });
  transcribeAudioFileMock.mockReset().mockResolvedValue({
    text: "the transcript",
    segments: [{ start: 0, end: 1, text: "the transcript" }],
    language: "en",
    engine: "api:whisper-large-v3-turbo",
  });
  execFileMock.mockReset().mockImplementation(async (_bin, args: string[]) => {
    if (args.includes("--skip-download")) return { stdout: "212\n", stderr: "" };
    return { stdout: "", stderr: "" }; // download
  });
  configured = true;
  format = "mp3";
});

afterEach(() => {
  delete process.env.AUDIO_MAX_DURATION_SEC;
});

describe("isAudioConfigured", () => {
  it("reflects the transcription engine", () => {
    configured = false;
    expect(isAudioConfigured()).toBe(false);
    configured = true;
    expect(isAudioConfigured()).toBe(true);
  });
});

describe("transcribeUrlAudio", () => {
  it("throws (and never shells out) when no engine is configured", async () => {
    configured = false;
    await expect(
      transcribeUrlAudio("https://youtu.be/abc"),
    ).rejects.toThrow(/not configured/i);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("runs the SSRF guard BEFORE any yt-dlp call", async () => {
    assertSafeUrlMock.mockRejectedValueOnce(new Error("private IP blocked"));
    await expect(
      transcribeUrlAudio("http://169.254.169.254/x.mp3"),
    ).rejects.toThrow(/private IP/i);
    expect(assertSafeUrlMock).toHaveBeenCalledOnce();
    expect(execFileMock).not.toHaveBeenCalled();
    expect(transcribeAudioFileMock).not.toHaveBeenCalled();
  });

  it("rejects media longer than the sync cap", async () => {
    process.env.AUDIO_MAX_DURATION_SEC = "100";
    // probe returns 212s > 100s cap
    await expect(
      transcribeUrlAudio("https://youtu.be/abc", { async: false }),
    ).rejects.toThrow(/over the 100s limit/i);
    // probe ran, download did not
    expect(
      execFileMock.mock.calls.some((c) =>
        (c[1] as string[]).includes("-x"),
      ),
    ).toBe(false);
  });

  it("allows long media when run as an async scrape", async () => {
    process.env.AUDIO_MAX_DURATION_SEC = "100"; // sync cap (ignored for async)
    const r = await transcribeUrlAudio("https://youtu.be/abc", {
      async: true,
    });
    expect(r.transcript).toBe("the transcript");
  });

  it("downloads + transcribes on the happy path and shapes the result", async () => {
    const r = await transcribeUrlAudio("https://youtu.be/abc", {
      language: "en",
    });

    // probe + download both invoked
    const calledArgs = execFileMock.mock.calls.map((c) => c[1] as string[]);
    expect(calledArgs.some((a) => a.includes("--skip-download"))).toBe(true);
    expect(calledArgs.some((a) => a.includes("-x"))).toBe(true);

    // transcribe got the downloaded file + language hint
    expect(transcribeAudioFileMock).toHaveBeenCalledOnce();
    const [audioPath, opts] = transcribeAudioFileMock.mock.calls[0] as [
      string,
      { language?: string },
    ];
    expect(audioPath).toMatch(/audio\.mp3$/);
    expect(opts.language).toBe("en");

    expect(r).toMatchObject({
      transcript: "the transcript",
      language: "en",
      engine: "api:whisper-large-v3-turbo",
      source: "https://youtu.be/abc",
      durationSec: 212,
    });
    expect(r.segments).toHaveLength(1);
  });

  it("passes 16k mono resample args to ffmpeg for the local wav engine", async () => {
    format = "wav16k";
    await transcribeUrlAudio("https://youtu.be/abc");
    const downloadCall = execFileMock.mock.calls
      .map((c) => c[1] as string[])
      .find((a) => a.includes("-x"))!;
    const ppIdx = downloadCall.indexOf("--postprocessor-args");
    expect(ppIdx).toBeGreaterThan(-1);
    expect(downloadCall[ppIdx + 1]).toContain("-ar 16000");
    expect(downloadCall[ppIdx + 1]).toContain("-ac 1");
    expect(downloadCall).toContain("wav");
  });
});
