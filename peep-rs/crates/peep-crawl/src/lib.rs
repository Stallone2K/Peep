//! peep-crawl — BFS frontier, sitemap discovery, URL filters (added R3).
//!
//! Ports `src/server/crawl/{frontier,sitemap,filters}.ts`, reusing the
//! `crawl:{jobId}:seen` Redis dedup set and `crawl:event:{jobId}` channel.
//! May wrap the `spider` crate for the HTTP-first streaming crawl.
