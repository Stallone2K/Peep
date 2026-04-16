// Site-wide graph paper for the marketing route group.
//
// 96px square tile so 1152 (max-w-6xl) / 96 = 12 cells across the
// centered content container. Tile origin anchored to viewport center,
// which guarantees vertical lines fall on content edges and on every
// section's column boundaries.
//
// Lines and intersection dots are deliberately near-invisible — the
// grid should be felt as structure, not seen as decoration.

const TILE_PX = 96;

const TILE = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_PX}" height="${TILE_PX}">` +
    `<path d="M 0 0 L 0 ${TILE_PX} M 0 0 L ${TILE_PX} 0" stroke="rgba(255,255,255,0.022)" stroke-width="1"/>` +
    `<circle cx="0" cy="0" r="1.3" fill="rgba(255,255,255,0.14)"/>` +
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
        maskImage:
          "linear-gradient(to bottom, black 0, black calc(100% - 96px), transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, black 0, black calc(100% - 96px), transparent 100%)",
      }}
    />
  );
}
