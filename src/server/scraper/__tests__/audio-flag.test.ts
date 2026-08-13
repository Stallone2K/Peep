import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isAudioFormatEnabled } from "@/server/scraper/audio";

// The audio format ships gated behind AUDIO_FORMAT_ENABLED ("Coming
// Soon"). This locks in the default-off behaviour so the format can't
// silently start charging / running before it's flipped on.

beforeEach(() => {
  delete process.env.AUDIO_FORMAT_ENABLED;
});
afterEach(() => {
  delete process.env.AUDIO_FORMAT_ENABLED;
});

describe("isAudioFormatEnabled", () => {
  it("defaults to OFF when the env var is unset", () => {
    expect(isAudioFormatEnabled()).toBe(false);
  });

  it("is OFF for any value other than the exact string 'true'", () => {
    for (const v of ["false", "1", "yes", "TRUE", "on", ""]) {
      process.env.AUDIO_FORMAT_ENABLED = v;
      expect(isAudioFormatEnabled()).toBe(false);
    }
  });

  it("is ON only for the exact string 'true'", () => {
    process.env.AUDIO_FORMAT_ENABLED = "true";
    expect(isAudioFormatEnabled()).toBe(true);
  });
});
