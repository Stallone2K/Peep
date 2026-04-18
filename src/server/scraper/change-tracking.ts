import { createHash } from "node:crypto";

import { createPatch } from "diff";

import { db } from "@/lib/db";
import { generateAI } from "@/server/ai/client";
import { parseJsonFromResponse } from "@/server/ai/extract";
import { isAIConfigured } from "@/server/ai/client";
import type { ScrapeRequestInput } from "@/lib/validators/scrape";

// Phase 7C — changeTracking format implementation.
//
// Pipeline per scrape:
//   1. loadPrevious(userId, url, tag?)  — newest snapshot for this scope
//   2. computeDiff(prev, curr, mode, ...) — git-diff or json
//   3. store(userId, url, tag, markdown, contentHash) — persist new snapshot
//
// `tag` lets the same URL carry multiple independent histories
// ("prod" vs "staging", "pre-redesign" vs "post-redesign").
// `visibility` is reported back to callers so they know the scope of
// the comparison ("user-scoped" — we don't share snapshots across
// tenants, but the field is here for forward-compat with team scopes).

const SYSTEM_PROMPT_DIFF_JSON = `You compare two versions of a web page and return a JSON object describing what changed.

Given a JSON Schema and two snapshots (PREV + CURR), extract the schema's fields from each and return:
{
  "previous": { ...fields extracted from PREV markdown... },
  "current":  { ...fields extracted from CURR markdown... }
}

RULES:
1. Return ONLY valid JSON — no fences, no prose.
2. Match the user-supplied schema exactly. Missing fields → null.
3. Do NOT hallucinate. If a field is not in the markdown, set it to null.
4. Numbers are numbers. Booleans are true/false. Stick to the schema's types.`;

export type ChangeStatus = "new" | "same" | "changed" | "removed";

export type ChangeTrackingResult = {
  previousScrapeAt: string | null; // ISO
  changeStatus: ChangeStatus;
  visibility: "user-scoped";
  diff?: {
    text: string; // unified diff, only present in git-diff mode
  };
  json?: {
    previous: unknown;
    current: unknown;
  };
};

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function loadPrevious(
  userId: string,
  url: string,
  tag: string | null,
): Promise<{
  id: string;
  markdown: string | null;
  contentHash: string;
  createdAt: Date;
} | null> {
  return db.changeSnapshot.findFirst({
    where: { userId, url, tag: tag ?? null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      markdown: true,
      contentHash: true,
      createdAt: true,
    },
  });
}

export async function storeSnapshot({
  userId,
  url,
  tag,
  markdown,
  contentHash,
}: {
  userId: string;
  url: string;
  tag: string | null;
  markdown: string | null;
  contentHash: string;
}): Promise<void> {
  await db.changeSnapshot.create({
    data: { userId, url, tag, markdown, contentHash },
  });
}

export function deriveChangeStatus(
  prevHash: string | undefined,
  currHash: string,
): ChangeStatus {
  if (!prevHash) return "new";
  if (prevHash === currHash) return "same";
  return "changed";
}

export function computeGitDiff({
  prevMarkdown,
  currMarkdown,
  url,
}: {
  prevMarkdown: string;
  currMarkdown: string;
  url: string;
}): string {
  // `createPatch` returns a unified-diff patch with file headers; the
  // URL is used as a stable label so callers can tell what changed
  // when they store / forward the diff.
  return createPatch(url, prevMarkdown, currMarkdown, "previous", "current");
}

export async function computeJsonDiff({
  prevMarkdown,
  currMarkdown,
  schema,
  prompt,
}: {
  prevMarkdown: string;
  currMarkdown: string;
  schema: Record<string, unknown> | undefined;
  prompt: string | undefined;
}): Promise<{ previous: unknown; current: unknown }> {
  if (!isAIConfigured()) {
    throw new Error(
      "changeTracking json mode requires GEMINI_API_KEY (AI is not configured)",
    );
  }

  const userMessage = [
    schema ? `<schema>${JSON.stringify(schema)}</schema>` : null,
    prompt ? `<instruction>${prompt}</instruction>` : null,
    "<previous>",
    prevMarkdown.slice(0, 10_000),
    "</previous>",
    "<current>",
    currMarkdown.slice(0, 10_000),
    "</current>",
  ]
    .filter(Boolean)
    .join("\n\n");

  const { text } = await generateAI({
    systemPrompt: SYSTEM_PROMPT_DIFF_JSON,
    userMessage,
    temperature: 0,
  });

  const parsed = parseJsonFromResponse(text) as {
    previous?: unknown;
    current?: unknown;
  };
  return {
    previous: parsed?.previous ?? null,
    current: parsed?.current ?? null,
  };
}

// Orchestrator — called by the scrape pipeline after HTML → markdown
// but before returning to the caller. No-ops if changeTracking isn't
// in the formats list. Always safe to call.
export async function applyChangeTracking({
  userId,
  input,
  currentMarkdown,
}: {
  userId: string;
  input: ScrapeRequestInput;
  currentMarkdown: string | null;
}): Promise<ChangeTrackingResult | null> {
  const ct = input.formats.find((f) => f.type === "changeTracking") as
    | {
        type: "changeTracking";
        modes?: string[];
        schema?: unknown;
        prompt?: string;
        tag?: string | null;
      }
    | undefined;
  if (!ct) return null;

  // The format validator already enforces "changeTracking requires
  // markdown in formats too", so currentMarkdown is expected. Guard
  // anyway — if markdown rendering failed silently we don't want to
  // poison the snapshot history with null content.
  if (!currentMarkdown) return null;

  const tag = ct.tag ?? null;
  const currHash = hashContent(currentMarkdown);
  const prev = await loadPrevious(userId, input.url, tag);
  const status = deriveChangeStatus(prev?.contentHash, currHash);

  const result: ChangeTrackingResult = {
    previousScrapeAt: prev?.createdAt.toISOString() ?? null,
    changeStatus: status,
    visibility: "user-scoped",
  };

  // Only spend compute/AI budget if something actually changed.
  if (status === "changed" && prev?.markdown) {
    const modes = ct.modes ?? [];
    if (modes.includes("git-diff")) {
      result.diff = {
        text: computeGitDiff({
          prevMarkdown: prev.markdown,
          currMarkdown: currentMarkdown,
          url: input.url,
        }),
      };
    }
    if (modes.includes("json")) {
      try {
        result.json = await computeJsonDiff({
          prevMarkdown: prev.markdown,
          currMarkdown: currentMarkdown,
          schema: ct.schema as Record<string, unknown> | undefined,
          prompt: ct.prompt,
        });
      } catch (err) {
        // Don't fail the scrape if JSON-mode comparison dies — fall
        // through and let git-diff (if requested) carry the signal.
        console.error("[changeTracking] json-mode diff failed", err);
      }
    }
  }

  // Persist the new snapshot regardless of status so future scrapes
  // have a baseline. Keeps history even across `same` runs (useful
  // for timestamped timelines on the dashboard later).
  await storeSnapshot({
    userId,
    url: input.url,
    tag,
    markdown: currentMarkdown,
    contentHash: currHash,
  }).catch((err) => {
    console.error("[changeTracking] storeSnapshot failed", err);
  });

  return result;
}
