// Thin REST client for the Peep API. The MCP server is a wrapper over
// these calls — auth, credit-header surfacing, and async job polling
// all live here so the tool handlers stay declarative.

const BASE = process.env.PEEP_API_BASE ?? "https://peep.shownomore.com";
const KEY = process.env.PEEP_API_KEY;

export type PeepResponse = {
  ok: boolean;
  status: number;
  json: Record<string, unknown> & { jobId?: string; status?: string };
  credits: { used: string | null; remaining: string | null };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function callPeep(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<PeepResponse> {
  if (!KEY) {
    throw new Error(
      "PEEP_API_KEY is not set. Create a key at https://peep.shownomore.com/dashboard/api-keys and pass it via the PEEP_API_KEY environment variable.",
    );
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json: PeepResponse["json"];
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  return {
    ok: res.ok,
    status: res.status,
    json,
    credits: {
      used: res.headers.get("x-peep-credits-used"),
      remaining: res.headers.get("x-peep-credits-remaining"),
    },
  };
}

// Poll an async job's status endpoint until it reaches a terminal
// state or the timeout elapses. Returns the last response either way.
export async function pollJob(
  statusPath: string,
  jobId: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<PeepResponse> {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const intervalMs = opts.intervalMs ?? 2_500;
  const deadline = Date.now() + timeoutMs;

  let last = await callPeep("GET", `${statusPath}/${jobId}`);
  while (Date.now() < deadline) {
    const status = String(last.json?.status ?? "").toLowerCase();
    if (/completed|failed|cancelled|canceled|error/.test(status)) return last;
    await sleep(intervalMs);
    last = await callPeep("GET", `${statusPath}/${jobId}`);
  }
  return last; // timed out — return whatever we have
}

// POST to a start endpoint and optionally block until the job finishes.
export async function startMaybeWait(
  startPath: string,
  body: Record<string, unknown>,
  statusPath: string,
  wait: boolean,
): Promise<PeepResponse> {
  const start = await callPeep("POST", startPath, body);
  if (!start.ok || !wait || !start.json?.jobId) return start;
  return pollJob(statusPath, start.json.jobId);
}
