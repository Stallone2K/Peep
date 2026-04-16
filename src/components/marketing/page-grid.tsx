// Subtle graph paper for the marketing route group.
//
// The grid is intentionally CONTAINED — it lives only inside the
// max-w-6xl frame in the marketing layout, never spanning the full
// viewport. Nav, hero, and every section sit on top of it; the area
// outside the frame is plain background.
//
// 96px square tile so 1152 (max-w-6xl) / 96 = 12 cells across the
// content column. Tile origin anchored to top-left of the frame so
// vertical lines fall on cell boundaries inside the frame.

const TILE_PX = 96;

const TILE = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_PX}" height="${TILE_PX}">` +
    `<path d="M 0 0 L 0 ${TILE_PX} M 0 0 L ${TILE_PX} 0" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>` +
    `<circle cx="0" cy="0" r="1.3" fill="rgba(255,255,255,0.16)"/>` +
    `</svg>`,
)}`;

export function PageGrid() {
  return (
    <div
      aria-hidden
      className="border-border/30 pointer-events-none absolute inset-0 -z-10 border-x"
      style={{
        backgroundImage: `url("${TILE}")`,
        backgroundSize: `${TILE_PX}px ${TILE_PX}px`,
        backgroundPosition: "0 0",
        backgroundRepeat: "repeat",
      }}
    />
  );
}
