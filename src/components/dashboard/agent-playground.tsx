"use client";

import { useRef, useState } from "react";
import { HardHat, Loader2, Download, Search, Telescope } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Step = { type: string; detail: string; at: string };
type Rec = Record<string, unknown>;

export function AgentPlayground() {
  const [prompt, setPrompt] = useState("");
  const [targetRecords, setTargetRecords] = useState(40);
  const [maxSources, setMaxSources] = useState(15);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [records, setRecords] = useState<Rec[]>([]);
  const [fields, setFields] = useState<string[]>([]);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function run() {
    if (!prompt.trim() || running) return;
    setRunning(true);
    setStatus("queued");
    setSteps([]);
    setRecords([]);
    setFields([]);
    try {
      const res = await fetch("/api/dashboard/playground/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, targetRecords, maxSources }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json?.error?.message ?? "Agent Failed To Start");
        setRunning(false);
        return;
      }
      poll(json.jobId);
    } catch {
      toast.error("Network Error");
      setRunning(false);
    }
  }

  function poll(jobId: string) {
    const tick = async () => {
      try {
        const res = await fetch(`/api/dashboard/playground/agent/${jobId}`);
        const j = await res.json();
        if (res.ok && j.success) {
          setStatus(j.status);
          const prog = j.progress as
            | { steps?: Step[]; records?: Rec[]; fields?: string[] }
            | null;
          const final = j.result as
            | { records?: Rec[]; fields?: string[]; steps?: Step[] }
            | null;
          if (prog?.steps) setSteps(prog.steps);
          if (final?.records) {
            setRecords(final.records);
            setFields(final.fields ?? deriveFields(final.records));
          } else if (prog?.records) {
            setRecords(prog.records);
            setFields(prog.fields ?? deriveFields(prog.records));
          }
          if (j.status === "done" || j.status === "failed") {
            setRunning(false);
            if (j.status === "failed")
              toast.error(j.error ?? "Agent Run Failed");
            else toast.success(`Found ${final?.records?.length ?? 0} Records`);
            return;
          }
        }
      } catch {
        /* keep polling */
      }
      pollRef.current = setTimeout(tick, 2500);
    };
    void tick();
  }

  function exportCsv() {
    if (records.length === 0) return;
    const cols = fields.length ? fields : deriveFields(records);
    const esc = (v: unknown) =>
      `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      cols.join(","),
      ...records.map((r) => cols.map((c) => esc(r[c])).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "leads.csv";
    a.click();
  }

  const cols = fields.length ? fields : deriveFields(records);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <HardHat className="size-6 text-orange-400" /> Agent{" "}
          <span className="bg-muted/60 text-muted-foreground rounded px-1.5 py-0.5 text-[10px] font-medium uppercase">
            Research Preview
          </span>
        </h1>
        <p className="text-muted-foreground text-sm">
          Describe A Task — The Agent Searches The Web, Scrapes Every Source, And
          Returns A Deduplicated Table Of Records.
        </p>
      </div>

      <div className="border-border/60 bg-card/20 flex flex-col gap-3 rounded-xl border p-4">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          disabled={running}
          placeholder="e.g. Flats For Rent In Vivek Vihar, East Delhi — Owner Name, Phone, Price, Location, Images"
          className="placeholder:text-muted-foreground/60 min-h-[3rem] resize-none bg-transparent text-base outline-none disabled:opacity-50"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-muted-foreground flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              Target Records
              <Input
                type="number"
                min={1}
                max={500}
                value={targetRecords}
                onChange={(e) =>
                  setTargetRecords(Math.max(1, Number(e.target.value) || 1))
                }
                className="h-8 w-20"
                disabled={running}
              />
            </label>
            <label className="flex items-center gap-2">
              Max Sources
              <Input
                type="number"
                min={1}
                max={60}
                value={maxSources}
                onChange={(e) =>
                  setMaxSources(Math.max(1, Number(e.target.value) || 1))
                }
                className="h-8 w-20"
                disabled={running}
              />
            </label>
          </div>
          <Button onClick={run} disabled={running || !prompt.trim()}>
            {running ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Harvesting
              </>
            ) : (
              <>
                <HardHat className="size-4" /> Run Agent
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Live step trace */}
      {steps.length > 0 && (
        <div className="border-border/60 bg-card/20 flex max-h-56 flex-col gap-1 overflow-auto rounded-xl border p-4 font-mono text-xs">
          {steps.map((s, i) => (
            <div key={i} className="flex items-start gap-2">
              <StepIcon type={s.type} />
              <span className="text-muted-foreground">{s.detail}</span>
            </div>
          ))}
          {running && (
            <div className="text-muted-foreground/70 mt-1 flex items-center gap-2">
              <Loader2 className="size-3 animate-spin" /> {status}…
            </div>
          )}
        </div>
      )}

      {/* Results table */}
      {records.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">
              <span className="text-foreground font-medium">
                {records.length}
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
                    <th key={c} className="px-3 py-2 font-medium capitalize">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={i} className="border-border/40 border-t">
                    {cols.map((c) => (
                      <td
                        key={c}
                        className="text-foreground/90 max-w-[240px] truncate px-3 py-2"
                        title={String(r[c] ?? "")}
                      >
                        {renderCell(c, r[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function deriveFields(records: Rec[]): string[] {
  const keys = new Set<string>();
  for (const r of records.slice(0, 20))
    for (const k of Object.keys(r)) keys.add(k);
  return [...keys];
}

function renderCell(col: string, val: unknown) {
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
