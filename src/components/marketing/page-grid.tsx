// Site-wide subtle graph-paper background for the marketing route group.
// Sits as an absolute layer inside the (marketing) layout's relative
// wrapper so it stretches to the full scroll height of the page. Content
// sections render above it; semi-transparent section backgrounds let the
// grid read through.
export function PageGrid() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      {/* Lines */}
      <div
        className="bg-grid absolute inset-0"
        style={{ backgroundSize: "112px 112px" }}
      />
      {/* Dots at every intersection */}
      <div
        className="bg-grid-dots absolute inset-0"
        style={{
          backgroundSize: "112px 112px",
          backgroundPosition: "56px 56px",
        }}
      />
      {/* Fade the bottom so the footer sits on clean background */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, transparent 85%, var(--background))",
        }}
      />
    </div>
  );
}
