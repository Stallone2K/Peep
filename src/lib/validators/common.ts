import { z } from "zod";

// Shared zod helpers reused across request validators in /api/v1/* and
// /api/dashboard/*. Keep these purely shape-level — DNS-level SSRF
// resolution lives inside the fetcher (Phase 3).

// Basic URL validator. Rejects non-http(s) schemes and obvious localhost
// patterns. Full SSRF guard (private IPs, DNS rebinding) layered on at
// request time by the scraper's undici dispatcher.
export const urlSchema = z
  .string()
  .url({ message: "Must be a valid URL" })
  .refine((v) => /^https?:\/\//i.test(v), {
    message: "URL must use http:// or https://",
  })
  .refine(
    (v) => {
      try {
        const u = new URL(v);
        const host = u.hostname.toLowerCase();
        // Literal loopback / link-local hostnames — anything resolving
        // to RFC1918 IPs is blocked at fetch time.
        return (
          host !== "localhost" &&
          host !== "0.0.0.0" &&
          host !== "::1" &&
          !host.endsWith(".localhost")
        );
      } catch {
        return false;
      }
    },
    { message: "Loopback hosts are not allowed" },
  );

// Non-empty trimmed string with a character ceiling — used for user-
// facing free-text fields like API key names.
export function boundedString(min: number, max: number) {
  return z
    .string()
    .trim()
    .min(min, `Must be at least ${min} character${min === 1 ? "" : "s"}`)
    .max(max, `Must be at most ${max} characters`);
}

// Pagination cursor — opaque string, bounded length to discourage abuse.
export const cursorSchema = z.string().max(200).optional();

export const limitSchema = z.coerce.number().int().min(1).max(500).optional();
