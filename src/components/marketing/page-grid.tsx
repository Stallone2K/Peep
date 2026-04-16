// Site-wide graph paper for the marketing route group.
//
// One SVG tile (96px square) provides the grid lines + an intersection
// dot in a single layer. Tile origin is anchored to viewport center via
// `background-position: center`, which guarantees that grid lines fall
// on the edges of the centered max-w-6xl content container
// (1152 / 96 = 12 cells). Section card edges, the nav bar, the corner
// registration marks, and the hero pill all snap to the same lines.

const TILE_PX = 96;

const TILE = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_PX}" height="${TILE_PX}">` +
    // Subtle grid lines (top + left edges of each cell)
    `<path d="M 0 0 L 0 ${TILE_PX} M 0 0 L ${TILE_PX} 0" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>` +
    // Brighter dot at the top-left corner. Quarter renders inside this
    // tile; four neighbouring quarter-dots merge into one full mark at
    // each intersection.
    `<circle cx="0" cy="0" r="2" fill="rgba(255,255,255,0.32)"/>` +
    `</svg>`,
)}`;

export function PageGrid() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10"
      style={{
        backgroundImage: `url("${TILE}")`,
        backgroundSize: `${TILE_PX}px ${TILE_PX}px`,
        backgroundPosition: "center top",
        backgroundRepeat: "repeat",
        // Fade the grid only at the very last 96px so the footer reads clean
        maskImage:
          "linear-gradient(to bottom, black 0, black calc(100% - 96px), transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, black 0, black calc(100% - 96px), transparent 100%)",
      }}
    />
  );
}
