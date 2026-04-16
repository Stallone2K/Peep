// Placeholder "company logos" strip. Replace with real partner wordmarks
// as they come in. Using faint monospace wordmarks so the strip looks
// intentional at any resolution without committing to specific logos.
const COMPANIES = ["Acme", "Lumen", "Cinder", "Orbit", "Rasp"];

export function TrustLogos() {
  return (
    <div className="border-border/60 mx-auto grid max-w-6xl items-center gap-x-10 gap-y-6 border-y px-6 py-10 md:grid-cols-[auto_1fr]">
      <div className="text-muted-foreground max-w-xs text-sm leading-relaxed">
        Trusted By{" "}
        <span className="text-foreground font-medium">Early Teams</span>{" "}
        Building Agents And RAG At Scale.
      </div>
      <ul className="text-muted-foreground/60 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 font-mono text-sm tracking-wider md:justify-end">
        {COMPANIES.map((c) => (
          <li
            key={c}
            className="hover:text-foreground border-b-2 border-transparent pb-1 transition-colors hover:border-orange-500/60"
          >
            {c}
          </li>
        ))}
      </ul>
    </div>
  );
}
