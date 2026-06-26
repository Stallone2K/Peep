//! peep-core — the scraping engine, ported 1:1 from `src/server/scraper/*`.
//!
//! Module map (filled in across migration phases R1–R4):
//!   fetcher        ← fetcher.ts        (reqwest + SSRF guard)
//!   block_detect   ← block-detect.ts
//!   strategy       ← strategy.ts       (escalation ladder)
//!   readability    ← readability.ts    (dom_smoothie)
//!   markdown       ← turndown.ts       (htmd)
//!   links          ← links.ts
//!   robots         ← robots.ts
//!   change_tracking← change-tracking.ts
//!   sidecar        — HTTP client to the Node render/AI sidecars

pub use peep_contracts as contracts;

// Stub: real engine modules land in R1+. Kept empty-but-compiling so the
// workspace builds from day one of the strangler migration.
