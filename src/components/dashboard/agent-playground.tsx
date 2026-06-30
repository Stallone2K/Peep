"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Download,
  HardHat,
  Loader2,
  Search,
  Sparkles,
  Telescope,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Step = { type: string; detail: string; at: string };
type Rec = Record<string, unknown>;

type Turn = {
  id: string;
  prompt: string;
  status: string;
  steps: Step[];
  records: Rec[];
  fields: string[];
  error?: string;
  running: boolean;
};

const SUGGESTIONS = [
  "Flats For Rent In Vivek Vihar — Owner, Phone, Price, Images",
  "Indie Coffee Roasters In Portland With Contact Emails",
  "YC W24 AI Startups — Name, Website, Founder LinkedIn",
  "Dentists In Austin With Phone Numbers And Ratings",
];

export function AgentPlayground() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the conversation pinned to the latest content.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns]);

  useEffect(() => () => {
    if (pollRef.current) clearTimeout(pollRef.current);
  }, []);

  function patchTurn(id: string, patch: Partial<Turn>) {
    setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function autosize() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  async function submit(raw: string) {
    const prompt = raw.trim();
    if (!prompt || busy) return;

    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now());

    setTurns((ts) => [
      ...ts,
      { id, prompt, status: "queued", steps: [], records: [], fields: [], running: true },
    ]);
    setInput("");
    setBusy(true);
    requestAnimationFrame(autosize);

    try {
      const res = await fetch("/api/dashboard/playground/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        patchTurn(id, {
          running: false,
          status: "failed",
          error: json?.error?.message ?? "Agent Failed To Start",
        });
        setBusy(false);
        toast.error(json?.error?.message ?? "Agent Failed To Start");
        return;
      }
      poll(json.jobId, id);
    } catch {
      patchTurn(id, { running: false, status: "failed", error: "Network Error" });
      setBusy(false);
      toast.error("Network Error");
    }
  }

  function poll(jobId: string, id: string) {
    const tick = async () => {
      try {
        const res = await fetch(`/api/dashboard/playground/agent/${jobId}`);
        const j = await res.json();
        if (res.ok && j.success) {
          const prog = j.progress as
            | { steps?: Step[]; records?: Rec[]; fields?: string[] }
            | null;
          const final = j.result as
            | { records?: Rec[]; fields?: string[]; steps?: Step[] }
            | null;

          const patch: Partial<Turn> = { status: j.status };
          if (prog?.steps) patch.steps = prog.steps;
          if (final?.records) {
            patch.records = final.records;
            patch.fields = final.fields ?? deriveFields(final.records);
          } else if (prog?.records) {
            patch.records = prog.records;
            patch.fields = prog.fields ?? deriveFields(prog.records);
          }
          patchTurn(id, patch);

          if (j.status === "done" || j.status === "failed") {
            patchTurn(id, {
              running: false,
              ...(j.status === "failed"
                ? { error: j.error ?? "Agent Run Failed" }
                : {}),
            });
            setBusy(false);
            if (j.status === "failed") toast.error(j.error ?? "Agent Run Failed");
            else
              toast.success(`Found ${final?.records?.length ?? 0} Records`);
            return;
          }
        }
      } catch {
        /* transient — keep polling */
      }
      pollRef.current = setTimeout(tick, 2500);
    };
    void tick();
  }

  const empty = turns.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {empty ? (
          <EmptyState onPick={submit} disabled={busy} />
        ) : (
          <div className="flex flex-col gap-10 py-8">
            {turns.map((t) => (
              <TurnView key={t.id} turn={t} />
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="pt-2 pb-5">
        <div className="border-border/70 bg-card/40 focus-within:border-border flex items-end gap-2 rounded-2xl border px-3 py-2.5 transition-colors">
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autosize();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit(input);
              }
            }}
            rows={1}
            placeholder="Describe What The Agent Should Find…"
            className="placeholder:text-muted-foreground/50 max-h-[200px] min-h-[24px] flex-1 resize-none bg-transparent py-1 text-[15px] leading-relaxed outline-none"
          />
          <button
            type="button"
            onClick={() => void submit(input)}
            disabled={!input.trim() || busy}
            aria-label="Send"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-orange-500 text-black transition-colors hover:bg-orange-400 disabled:opacity-40 disabled:hover:bg-orange-500"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowUp className="size-4" />
            )}
          </button>
        </div>
        <p className="text-muted-foreground/50 mt-2 text-center text-xs">
          The Agent Searches The Web, Scrapes Every Source, And Returns A
          Deduplicated Table. Research Preview.
        </p>
      </div>
    </div>
  );
}

function EmptyState({
  onPick,
  disabled,
}: {
  onPick: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-7 px-4 text-center">
      <div className="flex flex-col items-center gap-4">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-orange-500/15 text-orange-400">
          <Sparkles className="size-6" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            What Should The Agent Find?
          </h1>
          <p className="text-muted-foreground max-w-md text-sm">
            Describe A Task In Plain Language. Peep Plans The Search, Scrapes
            Every Source, And Hands You A Clean Table.
          </p>
        </div>
      </div>

      <div className="flex w-full max-w-xl flex-col gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onPick(s)}
            className="border-border/60 bg-card/30 text-foreground/80 hover:border-border hover:bg-card/60 hover:text-foreground flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors disabled:opacity-50"
          >
            <Telescope className="size-4 shrink-0 text-orange-400/70" />
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  const cols = turn.fields.length ? turn.fields : deriveFields(turn.records);

  function exportCsv() {
    if (turn.records.length === 0) return;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      cols.join(","),
      ...turn.records.map((r) => cols.map((c) => esc(r[c])).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "leads.csv";
    a.click();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* User message */}
      <div className="flex justify-end">
        <div className="bg-card/70 border-border/60 max-w-[85%] rounded-2xl rounded-br-md border px-4 py-2.5 text-[15px] leading-relaxed">
          {turn.prompt}
        </div>
      </div>

      {/* Assistant response */}
      <div className="flex gap-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-orange-400">
          <Sparkles className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {/* Activity trace */}
          {(turn.steps.length > 0 || turn.running) && (
            <div className="flex flex-col gap-1.5 text-xs">
              {turn.steps.length === 0 && turn.running && (
                <div className="text-muted-foreground flex items-center gap-2">
                  <Loader2 className="size-3 animate-spin" /> Planning The
                  Search…
                </div>
              )}
              {turn.steps.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <StepIcon type={s.type} />
                  <span className="text-muted-foreground">{s.detail}</span>
                </div>
              ))}
              {turn.running && turn.steps.length > 0 && (
                <div className="text-muted-foreground/70 mt-0.5 flex items-center gap-2">
                  <Loader2 className="size-3 animate-spin" /> {turn.status}…
                </div>
              )}
            </div>
          )}

          {/* Results */}
          {turn.records.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">
                  <span className="text-foreground font-medium">
                    {turn.records.length}
                  </span>{" "}
                  Records
                </span>
                <Button variant="outline" size="sm" onClick={exportCsv}>
                  <Download className="size-4" /> Export CSV
                </Button>
              </div>
              <div className="border-border/60 overflow-auto rounded-lg border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      {cols.map((c) => (
                        <th
                          key={c}
                          className="px-3 py-2 font-medium capitalize"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {turn.records.map((r, i) => (
                      <tr key={i} className="border-border/40 border-t">
                        {cols.map((c) => (
                          <td
                            key={c}
                            className="text-foreground/90 max-w-[240px] truncate px-3 py-2"
                            title={String(r[c] ?? "")}
                          >
                            {renderCell(r[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {turn.error && (
            <p className="text-sm text-red-400">{turn.error}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function deriveFields(records: Rec[]): string[] {
  const keys = new Set<string>();
  for (const r of records.slice(0, 20))
    for (const k of Object.keys(r)) keys.add(k);
  return [...keys];
}

function renderCell(val: unknown) {
  const s = String(val ?? "");
  if (!s) return <span className="text-muted-foreground/50">—</span>;
  if (/^https?:\/\//.test(s))
    return (
      <a
        href={s}
        target="_blank"
        rel="noreferrer"
        className="text-orange-300 hover:underline"
      >
        {s}
      </a>
    );
  return s;
}

function StepIcon({ type }: { type: string }) {
  const Icon =
    type === "search" ? Search : type === "harvest" ? Telescope : HardHat;
  return (
    <Icon
      className={cn(
        "mt-0.5 size-3 shrink-0",
        type === "harvest" ? "text-orange-400" : "text-muted-foreground",
      )}
    />
  );
}
