export function WireframePreview() {
  return (
    <div className="border-border/60 bg-card/40 relative mx-auto w-full max-w-5xl overflow-hidden rounded-xl border backdrop-blur">
      {/* Browser chrome */}
      <div className="border-border/60 bg-background/40 flex items-center gap-1.5 border-b px-4 py-3">
        <span className="bg-border/60 size-2.5 rounded-full" />
        <span className="bg-border/60 size-2.5 rounded-full" />
        <span className="bg-border/60 size-2.5 rounded-full" />
      </div>

      <div className="grid gap-0 md:grid-cols-2">
        {/* Left: Wireframe */}
        <div className="border-border/40 space-y-3 border-b p-6 md:border-r md:border-b-0">
          <div className="flex items-center justify-between gap-3">
            <span className="bg-muted/70 inline-block size-6 rounded-full" />
            <span className="text-muted-foreground/80 font-mono text-[10px] uppercase tracking-wider">
              Logo
            </span>
            <div className="flex flex-1 items-center justify-center gap-2">
              <span className="bg-muted/70 h-2.5 w-14 rounded" />
              <span className="bg-muted/70 h-2.5 w-14 rounded" />
              <span className="bg-muted/70 h-2.5 w-14 rounded" />
            </div>
            <span className="text-muted-foreground/80 font-mono text-[10px] uppercase tracking-wider">
              Nav
            </span>
            <span className="bg-muted/70 h-7 w-16 rounded" />
            <span className="text-muted-foreground/80 font-mono text-[10px] uppercase tracking-wider">
              Button
            </span>
          </div>

          <div className="flex items-center gap-3 pt-4">
            <span className="text-muted-foreground/80 font-mono text-[10px] uppercase tracking-wider">
              H1
            </span>
            <div className="bg-muted/70 h-4 flex-1 rounded" />
          </div>
          <div className="bg-muted/60 h-3 w-5/6 rounded" />
          <div className="bg-muted/60 h-3 w-4/6 rounded" />

          <div className="grid grid-cols-3 gap-3 pt-4">
            <div className="bg-muted/60 h-20 rounded-lg" />
            <div className="bg-muted/60 h-20 rounded-lg" />
            <div className="bg-muted/60 h-20 rounded-lg" />
          </div>
        </div>

        {/* Right: JSON output */}
        <div className="bg-background/30 p-6">
          <div className="text-muted-foreground mb-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider">
            <span>Output</span>
            <span>.json</span>
          </div>
          <pre className="font-mono text-[12px] leading-relaxed">
            <code>
              <span className="text-muted-foreground">{"{"}</span>
              {"\n  "}
              <span className="text-orange-300">{'"url"'}</span>
              <span className="text-muted-foreground">: </span>
              <span>{'"https://example.com"'}</span>
              <span className="text-muted-foreground">,</span>
              {"\n  "}
              <span className="text-orange-300">{'"title"'}</span>
              <span className="text-muted-foreground">: </span>
              <span>{'"Example Domain"'}</span>
              <span className="text-muted-foreground">,</span>
              {"\n  "}
              <span className="text-orange-300">{'"markdown"'}</span>
              <span className="text-muted-foreground">: </span>
              <span>{'"# Example Domain\\n\\nThis Domain..."'}</span>
              <span className="text-muted-foreground">,</span>
              {"\n  "}
              <span className="text-orange-300">{'"links"'}</span>
              <span className="text-muted-foreground">: [</span>
              {"\n    "}
              <span>{'"https://www.iana.org/domains"'}</span>
              {"\n  "}
              <span className="text-muted-foreground">],</span>
              {"\n  "}
              <span className="text-orange-300">{'"status"'}</span>
              <span className="text-muted-foreground">: </span>
              <span className="text-emerald-400">200</span>
              {"\n"}
              <span className="text-muted-foreground">{"}"}</span>
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
}
