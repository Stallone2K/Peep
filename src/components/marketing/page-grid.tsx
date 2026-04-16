// Site-wide graph paper for the marketing route group.
//
// 144px square tile so that 1152 (max-w-6xl) / 144 = 8 cells across
// the centered content container. Anchored to viewport center, so
// vertical grid lines fall on the content edges and on every section's
// internal column boundaries.
//
// Lines and intersection dots are deliberately near-invisible — the
// grid should be felt as structure, not seen as decoration.

const TILE_PX = 144;

const TILE = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_PX}" height="${TILE_PX}">` +
    `<path d="M 0 0 L 0 ${TILE_PX} M 0 0 L ${TILE_PX} 0" stroke="rgba(255,255,255,0.022)" stroke-width="1"/>` +
    `<circle cx="0" cy="0" r="1.4" fill="rgba(255,255,255,0.16)"/>` +
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
          "linear-gradient(to bottom, black 0, black calc(100% - 144px), transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, black 0, black calc(100% - 144px), transparent 100%)",
      }}
    />
  );
}
