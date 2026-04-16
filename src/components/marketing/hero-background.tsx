// Small pixel-art flecks that live inside grid cells
// (faintly hinted squares, like rendered fragments of scraped data)
const DECOS = [
  { top: "8%", left: "50%", cells: 3 },
  { top: "18%", left: "68%", cells: 5 },
  { top: "30%", left: "7%", cells: 6 },
  { top: "30%", left: "74%", cells: 4 },
  { top: "52%", left: "30%", cells: 9 },
  { top: "58%", left: "78%", cells: 5 },
  { top: "70%", left: "15%", cells: 4 },
];

function PixelCluster({ cells }: { cells: number }) {
  // A small cluster of 3px squares arranged in a rough triangle/scatter
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
      {/* Base grid (thin lines) */}
      <div
        aria-hidden
        className="bg-grid absolute inset-0 -z-30"
        style={{ backgroundSize: "112px 112px" }}
      />
      {/* Dots at every grid intersection */}
      <div
        aria-hidden
        className="bg-grid-dots mask-radial-fade absolute inset-0 -z-30"
        style={{ backgroundSize: "112px 112px", backgroundPosition: "56px 56px" }}
      />

      {/* Pixel-art clusters (simulated ASCII scrape output fragments) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-20">
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

      {/* Corner markers (imaginary frame registration marks) */}
      <div
        aria-hidden
        className="text-muted-foreground/50 pointer-events-none absolute inset-0 -z-10 font-mono text-[11px] tracking-wider"
      >
        <span className="absolute top-6 left-6">[ 200 OK ]</span>
        <span className="absolute top-6 right-6">[ SCRAPE ]</span>
        <span className="absolute bottom-24 left-6">[ .JSON ]</span>
        <span className="absolute bottom-24 right-6">[ .MD ]</span>
      </div>

    </>
  );
}
