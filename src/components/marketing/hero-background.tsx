// Hero-only decorations: corner registration marks + scattered pixel-art
// clusters. The base grid + intersection dots now live site-wide in
// <PageGrid /> so the graph paper continues beneath every section.

const DECOS = [
  { top: "22%", left: "10%", cells: 6 },
  { top: "32%", left: "82%", cells: 5 },
  { top: "62%", left: "16%", cells: 4 },
];

function PixelCluster({ cells }: { cells: number }) {
  const arr = Array.from({ length: cells });
  return (
    <div className="relative size-16">
      {arr.map((_, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        return (
          <span
            key={i}
            className="bg-muted-foreground/30 absolute size-[3px] rounded-[1px]"
            style={{
              left: `${col * 8 + (row % 2 === 1 ? 4 : 0)}px`,
              top: `${row * 8}px`,
            }}
          />
        );
      })}
    </div>
  );
}

export function HeroBackground() {
  return (
    <>
      {/* Pixel-art clusters (simulated ASCII scrape-output fragments) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {DECOS.map((d, i) => (
          <div
            key={i}
            className="absolute"
            style={{ top: d.top, left: d.left }}
          >
            <PixelCluster cells={d.cells} />
          </div>
        ))}
      </div>

      {/* Corner registration marks anchored to the max-w-6xl content edges
          (which coincide with grid lines, since 1152 / 96 = 12 cells).
          Vertical positions sit on grid lines too. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <div className="text-muted-foreground/60 font-mono text-[11px] tracking-wider mx-auto h-full max-w-6xl relative px-3">
          <span className="absolute top-3 left-3">[ 200 OK ]</span>
          <span className="absolute top-3 right-3">[ SCRAPE ]</span>
          <span className="absolute bottom-28 left-3">[ .JSON ]</span>
          <span className="absolute bottom-28 right-3">[ .MD ]</span>
        </div>
      </div>
    </>
  );
}
