import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the fs reads/writes the engines do so no real files are touched.
const fileStore = new Map<string, string | Buffer>();
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async (p: string, enc?: string) => {
    const v = fileStore.get(p);
    if (v === undefined) throw new Error(`ENOENT ${p}`);
    return enc ? v.toString() : v;
  }),
  rm: vi.fn(async () => {}),
}));

// Mock child_process for the local whisper.cpp path.
const execFileMock = vi.fn();
vi.mock("node:child_process", () => ({
  execFile: (
    ...args: unknown[]
  ) => {
    // promisify(execFile) calls it with a trailing callback.
    const cb = args[args.length - 1] as (
      e: unknown,
      r?: { stdout: string; stderr: string },
    ) => void;
    execFileMock(...args.slice(0, -1))
      .then((r: { stdout: string; stderr: string }) => cb(null, r))
      .catch((e: unknown) => cb(e));
  },
}));

import {
  transcribeEngine,
  isTranscriptionConfigured,
  preferredAudioFormat,
  transcribeAudioFile,
} from "@/server/scraper/transcribe";

const ENV_KEYS = [
  "WHISPER_API_KEY",
  "WHISPER_API_URL",
  "WHISPER_API_MODEL",
  "WHISPER_CPP_BIN",
  "WHISPER_CPP_MODEL",
];

beforeEach(() => {
  fileStore.clear();
  execFileMock.mockReset();
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  vi.unstubAllGlobals();
});

describe("engine selection", () => {
  it("is unconfigured with no env", () => {
    expect(transcribeEngine()).toBe(null);
    expect(isTranscriptionConfigured()).toBe(false);
  });

  it("prefers the API engine when WHISPER_API_KEY is set", () => {
    process.env.WHISPER_API_KEY = "gsk_test";
    expect(transcribeEngine()).toBe("api");
    expect(preferredAudioFormat()).toBe("mp3");
  });

  it("uses local whisper.cpp when only the binary is set", () => {
    process.env.WHISPER_CPP_BIN = "/usr/bin/whisper-cli";
    expect(transcribeEngine()).toBe("local");
    expect(preferredAudioFormat()).toBe("wav16k");
  });

  it("throws when transcribing with no engine configured", async () => {
    await expect(transcribeAudioFile("/tmp/a.mp3")).rejects.toThrow(
      /not configured/i,
    );
  });
});

describe("API backend (Groq/OpenAI-compatible)", () => {
  beforeEach(() => {
    process.env.WHISPER_API_KEY = "gsk_test";
    fileStore.set("/tmp/audio.mp3", Buffer.from("fake-audio-bytes"));
  });

  it("POSTs multipart to the transcriptions endpoint and maps segments", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          text: "hello world",
          language: "en",
          segments: [
            { start: 0, end: 1.5, text: " hello" },
            { start: 1.5, end: 2.0, text: "world " },
            { start: 2.0, end: 2.1, text: "  " }, // blank → filtered
          ],
        };
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await transcribeAudioFile("/tmp/audio.mp3", { language: "en" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer gsk_test",
    );
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get("model")).toBe("whisper-large-v3-turbo");
    expect(form.get("response_format")).toBe("verbose_json");
    expect(form.get("language")).toBe("en");

    expect(r.text).toBe("hello world");
    expect(r.language).toBe("en");
    expect(r.engine).toBe("api:whisper-large-v3-turbo");
    expect(r.segments).toEqual([
      { start: 0, end: 1.5, text: "hello" },
      { start: 1.5, end: 2.0, text: "world" },
    ]);
  });

  it("honours a custom base URL + model", async () => {
    process.env.WHISPER_API_URL = "https://api.example.com/v1/";
    process.env.WHISPER_API_MODEL = "whisper-large-v3";
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      async json() {
        return { text: "x", segments: [] };
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await transcribeAudioFile("/tmp/audio.mp3");
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    // trailing slash trimmed, no double slash
    expect(url).toBe("https://api.example.com/v1/audio/transcriptions");
    expect(r.engine).toBe("api:whisper-large-v3");
  });

  it("throws on a non-2xx API response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 429,
        async text() {
          return "rate limited";
        },
      })),
    );
    await expect(transcribeAudioFile("/tmp/audio.mp3")).rejects.toThrow(
      /429/,
    );
  });

  it("rejects files over the upload cap", async () => {
    process.env.WHISPER_API_MAX_UPLOAD_BYTES = "8";
    fileStore.set("/tmp/audio.mp3", Buffer.from("way-too-many-bytes"));
    await expect(transcribeAudioFile("/tmp/audio.mp3")).rejects.toThrow(
      /upload cap/i,
    );
    delete process.env.WHISPER_API_MAX_UPLOAD_BYTES;
  });
});

describe("local whisper.cpp backend", () => {
  beforeEach(() => {
    process.env.WHISPER_CPP_BIN = "/usr/bin/whisper-cli";
    process.env.WHISPER_CPP_MODEL = "/models/ggml-base.bin";
  });

  it("shells out with an argv array (no shell) and parses the json", async () => {
    execFileMock.mockImplementation(async (bin: string, args: string[]) => {
      // whisper.cpp writes <-of>.json — emulate that side effect.
      const ofIdx = args.indexOf("-of");
      const base = args[ofIdx + 1];
      fileStore.set(
        `${base}.json`,
        JSON.stringify({
          transcription: [
            { offsets: { from: 0, to: 1200 }, text: " Hello" },
            { offsets: { from: 1200, to: 2400 }, text: " there" },
          ],
        }),
      );
      return { stdout: "", stderr: "" };
    });

    const r = await transcribeAudioFile("/tmp/audio.wav", { language: "en" });

    const [bin, args] = execFileMock.mock.calls[0] as [string, string[]];
    expect(bin).toBe("/usr/bin/whisper-cli");
    expect(args).toContain("-m");
    expect(args).toContain("/models/ggml-base.bin");
    expect(args).toContain("-l");
    expect(args).toContain("en");
    expect(Array.isArray(args)).toBe(true);

    expect(r.engine).toBe("local:whisper.cpp");
    expect(r.text).toBe("Hello there");
    expect(r.segments).toEqual([
      { start: 0, end: 1.2, text: "Hello" },
      { start: 1.2, end: 2.4, text: "there" },
    ]);
  });

  it("requires a model file", async () => {
    delete process.env.WHISPER_CPP_MODEL;
    await expect(transcribeAudioFile("/tmp/audio.wav")).rejects.toThrow(
      /WHISPER_CPP_MODEL/,
    );
  });
});
