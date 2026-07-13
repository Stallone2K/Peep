import { generateAI, isAIConfigured, MAX_INPUT_CHARS } from "@/server/ai/client";
import { parseJsonFromResponse } from "@/server/ai/extract";
import { resolveSearchProvider } from "@/server/search";
import { runScrapeWithStrategy } from "@/server/scraper/strategy";
import type { ScrapeRequestInput } from "@/lib/validators/scrape";
import type { AgentRequestInput } from "@/lib/validators/agent";

// AG-1 — the lead/data harvesting pipeline. Plan (LLM) → Discover (search) →
// Harvest (scrape + LLM extract) → Aggregate (dedupe). Returns a flat table of
// records. Budgeted by targetRecords / maxSources so a run can't go infinite.

export type AgentStep = { type: string; detail: string; at: string };
export type AgentRecord = Record<string, unknown> & { sourceUrl?: string };
export type AgentResult = {
  task: string;
  fields: string[];
  records: AgentRecord[];
  totalRecords: number;
  sourcesScanned: number;
  steps: AgentStep[];
};

type Plan = { fields: string[]; queries: string[] };

export async function runAgentHarvest(
  input: AgentRequestInput,
  onStep?: (s: AgentStep) => void,
): Promise<AgentResult> {
  const steps: AgentStep[] = [];
  const log = (type: string, detail: string) => {
    const s = { type, detail, at: new Date().toISOString() };
    steps.push(s);
    onStep?.(s);
  };

  if (!isAIConfigured()) {
    log(
      "plan",
      "AI is not configured — planning + record extraction are degraded (set NVIDIA_API_KEY or GEMINI_API_KEY).",
    );
  }

  // 1. PLAN — LLM derives the output fields + diverse search queries.
  // planTask never throws: on any AI failure/timeout it returns a fallback
  // plan (schema fields or the raw prompt) so a slow/aborted planner can't
  // terminate the whole run.
  const plan = await planTask(input);
  log(
    "plan",
    `Fields: ${plan.fields.join(", ")} · ${plan.queries.length} queries`,
  );

  // 2. DISCOVER — run each query through search, collect candidate sources.
  const provider = resolveSearchProvider();
  const candidates = new Set<string>(input.urls ?? []);
  for (const q of plan.queries) {
    if (candidates.size >= input.maxSources * 2) break;
    try {
      const results = await provider.search({
        query: q,
        limit: 10,
        sources: ["web"],
        country: input.country,
        lang: input.lang,
      });
      for (const r of results) candidates.add(r.url);
      log("search", `"${q}" → ${results.length} results`);
    } catch {
      log("search", `"${q}" → failed`);
    }
  }
  const sources = [...candidates].slice(0, input.maxSources);

  // 3. HARVEST — scrape each source, LLM-extract every matching record.
  const records: AgentRecord[] = [];
  const seen = new Set<string>();
  for (const url of sources) {
    if (records.length >= input.targetRecords) break;
    try {
      const scrape = await runScrapeWithStrategy(defaultScrapeInput(url));
      const md = scrape.markdown ?? "";
      if (!md) {
        log("harvest", `${hostOf(url)} → no content`);
        continue;
      }
      const extracted = await extractRecords(md, plan, input.prompt);
      let added = 0;
      for (const rec of extracted) {
        const key = recordKey(rec);
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        records.push({ ...rec, sourceUrl: url });
        added += 1;
        if (records.length >= input.targetRecords) break;
      }
      log(
        "harvest",
        `${hostOf(url)} → +${added} (${records.length}/${input.targetRecords})`,
      );
    } catch {
      log("harvest", `${hostOf(url)} → failed`);
    }
  }

  return {
    task: input.prompt,
    fields: plan.fields,
    records,
    totalRecords: records.length,
    sourcesScanned: sources.length,
    steps,
  };
}

// ─── LLM steps ───────────────────────────────────────────────────────
async function planTask(input: AgentRequestInput): Promise<Plan> {
  // Deterministic fallback used whenever the AI planner is unavailable,
  // times out (AbortError), or returns unusable output — so the harvest
  // always proceeds instead of aborting the whole agent run.
  const schemaFields =
    input.schema && typeof input.schema === "object"
      ? Object.keys(input.schema as object)
      : [];
  const fallback: Plan = {
    fields: schemaFields.length ? schemaFields : ["name", "detail", "url"],
    queries: [input.prompt],
  };

  const schemaHint = schemaFields.length
    ? `\nUse these exact fields: ${schemaFields.join(", ")}.`
    : "";

  let text: string;
  try {
    ({ text } = await generateAI({
      systemPrompt:
        "You are a web-research planner. Given a data-harvesting task, return ONLY JSON " +
        '{"fields": string[], "queries": string[]}. `fields` are the data columns to ' +
        "extract (e.g. name, phone, price, location, imageUrl, sourceUrl). `queries` are " +
        "5-8 DIVERSE web-search queries that would surface pages containing this data " +
        "(include owner/contact-oriented and site-specific angles).",
      userMessage: `TASK: ${input.prompt}${schemaHint}`,
      expectJson: true,
    }));
  } catch {
    return fallback;
  }

  const parsed = parseJsonFromResponse(text) as Partial<Plan>;
  const fields =
    Array.isArray(parsed.fields) && parsed.fields.length
      ? parsed.fields.map(String)
      : fallback.fields;
  const queries =
    Array.isArray(parsed.queries) && parsed.queries.length
      ? parsed.queries.map(String).slice(0, 8)
      : fallback.queries;
  return { fields, queries };
}

async function extractRecords(
  markdown: string,
  plan: Plan,
  task: string,
): Promise<AgentRecord[]> {
  const { text } = await generateAI({
    systemPrompt:
      "You extract structured records from page content for a research task. " +
      `Return ONLY a JSON array of objects, each with these fields: ${plan.fields.join(", ")}. ` +
      "Extract EVERY matching record on the page (each listing / lead / item is one " +
      "object). Use null for unknown fields. Return [] if the page has none.",
    userMessage: `TASK: ${task}\n\nPAGE CONTENT:\n${markdown.slice(0, MAX_INPUT_CHARS)}`,
    expectJson: true,
  });
  const parsed = parseJsonFromResponse(text);
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { records?: unknown[] })?.records)
      ? (parsed as { records: unknown[] }).records
      : [];
  return arr.filter(
    (r): r is AgentRecord => !!r && typeof r === "object",
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────
function defaultScrapeInput(url: string): ScrapeRequestInput {
  return {
    url,
    formats: [{ type: "markdown" }],
    onlyMainContent: true,
    onlyCleanContent: false,
    timeout: 30_000,
    waitFor: 0,
    mobile: false,
    removeBase64Images: true,
    fastMode: false,
    blockAds: true,
    proxy: "auto",
    storeInCache: true,
    is_async: false,
    respectRobotsTxt: true,
  } as unknown as ScrapeRequestInput;
}

function recordKey(rec: AgentRecord): string | null {
  const phone = String(rec.phone ?? rec.number ?? "").replace(/\D/g, "");
  if (phone.length >= 7) return `p:${phone}`;
  const email = String(rec.email ?? "").toLowerCase().trim();
  if (email.includes("@")) return `e:${email}`;
  const name = String(rec.name ?? rec.title ?? "").toLowerCase().trim();
  const loc = String(rec.location ?? rec.address ?? "").toLowerCase().trim();
  if (name) return `n:${name}|${loc}`;
  return null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
