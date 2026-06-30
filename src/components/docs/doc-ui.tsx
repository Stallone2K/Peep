import { Coins } from "lucide-react";

import { cn } from "@/lib/utils";

// ── HTTP method badge ──────────────────────────────────────────
const METHOD_STYLES: Record<string, string> = {
  GET: "bg-sky-500/15 text-sky-400 ring-sky-500/30",
  POST: "bg-orange-500/15 text-orange-400 ring-orange-500/30",
  DELETE: "bg-red-500/15 text-red-400 ring-red-500/30",
};

export function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs font-semibold ring-1 ring-inset",
        METHOD_STYLES[method] ?? "bg-muted text-muted-foreground ring-border",
      )}
    >
      {method}
    </span>
  );
}

// ── Endpoint header: METHOD /path + credit cost chip ───────────
export function EndpointHeader({
  method,
  path,
  credits,
}: {
  method: string;
  path: string;
  credits?: string;
}) {
  return (
    <div className="border-border/60 bg-card/40 my-6 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3">
      <MethodBadge method={method} />
      <code className="text-foreground font-mono text-sm">{path}</code>
      {credits ? (
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-400 ring-1 ring-inset ring-orange-500/20">
          <Coins className="size-3.5" />
          {credits}
        </span>
      ) : null}
    </div>
  );
}

// ── Parameter table ────────────────────────────────────────────
export type Param = {
  name: string;
  type: string;
  required?: boolean;
  description: React.ReactNode;
  default?: string;
};

export function ParamTable({ params }: { params: Param[] }) {
  return (
    <div className="border-border/60 my-5 overflow-hidden rounded-lg border">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-card/40 text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Parameter</th>
            <th className="px-4 py-2.5 font-medium">Type</th>
            <th className="px-4 py-2.5 font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {params.map((p) => (
            <tr key={p.name} className="border-border/50 border-t align-top">
              <td className="px-4 py-3 whitespace-nowrap">
                <code className="text-foreground font-mono text-[13px]">
                  {p.name}
                </code>
                {p.required ? (
                  <span className="ml-1.5 text-[10px] font-medium tracking-wide text-orange-400 uppercase">
                    required
                  </span>
                ) : null}
              </td>
              <td className="text-muted-foreground px-4 py-3 font-mono text-[13px] whitespace-nowrap">
                {p.type}
              </td>
              <td className="text-muted-foreground px-4 py-3 leading-relaxed">
                {p.description}
                {p.default !== undefined ? (
                  <span className="text-muted-foreground/70">
                    {" "}
                    Defaults to <code className="font-mono">{p.default}</code>.
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Callout (note / warning / tip) ─────────────────────────────
const CALLOUT_STYLES = {
  note: "border-sky-500/30 bg-sky-500/5 text-sky-200",
  warning: "border-amber-500/30 bg-amber-500/5 text-amber-200",
  tip: "border-orange-500/30 bg-orange-500/5 text-orange-200",
} as const;

export function Callout({
  type = "note",
  title,
  children,
}: {
  type?: keyof typeof CALLOUT_STYLES;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "my-5 rounded-lg border px-4 py-3 text-sm leading-relaxed",
        CALLOUT_STYLES[type],
      )}
    >
      {title ? <p className="mb-1 font-medium">{title}</p> : null}
      <div className="text-foreground/80">{children}</div>
    </div>
  );
}

// ── Prose primitives — consistent doc typography ───────────────
export function H2({ children }: { children: React.ReactNode }) {
  const id = slugify(children);
  return (
    <h2
      id={id}
      className="text-foreground mt-12 mb-3 scroll-mt-24 text-xl font-semibold tracking-tight"
    >
      {children}
    </h2>
  );
}

export function H3({ children }: { children: React.ReactNode }) {
  const id = slugify(children);
  return (
    <h3
      id={id}
      className="text-foreground mt-8 mb-2 scroll-mt-24 text-base font-semibold"
    >
      {children}
    </h3>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground my-4 text-[15px] leading-7">
      {children}
    </p>
  );
}

export function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="text-muted-foreground my-4 list-disc space-y-1.5 pl-5 text-[15px] leading-7">
      {children}
    </ul>
  );
}

export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="border-border/60 bg-card/60 text-foreground rounded border px-1.5 py-0.5 font-mono text-[13px]">
      {children}
    </code>
  );
}

function slugify(node: React.ReactNode): string {
  return String(node)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
