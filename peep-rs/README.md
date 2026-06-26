# peep-rs — Rust core for Peep

Performance-critical core of [Peep](../), migrated from TypeScript via an
incremental strangler. See the full plan in
[`.claude/plans/hashed-purring-cascade.md`](../.claude/plans/hashed-purring-cascade.md).

Rust owns the high-throughput **HTTP fetch + parse + markdown + crawl** path and the
queue workers; the proven Playwright-extra stealth stack stays as a Node sidecar for
protected/JS-heavy sites. Everything self-hosted on one VPS, $0.

## Workspace
```
crates/
  peep-contracts  wire-compatible serde structs (ScrapeRequestInput, ScrapeResult, *JobData)
  peep-core       the engine, 1:1 with src/server/scraper/* (modules land R1+)
  peep-store      Postgres writes via sqlx (R1)
  peep-queue      BullMQ/Redis interop + channel/key conventions
  peep-crawl      BFS frontier · sitemap · filters (R3)
bins/
  worker          tokio multi-queue consumer (scrape → crawl → map → batch)
```

## Develop
```bash
# data layer (postgres:5433, redis:6380 on the host — see ../docker-compose.yml)
cd .. && docker compose up -d

cd peep-rs
cargo build                       # whole workspace
cargo test -p peep-contracts      # contract parity tests
cargo run -p peep-worker          # boot the worker scaffold
```

## R0 status — done
- **Contracts** mirror the TS validators/result types; 4 parity tests green.
- **Queue interop verified end-to-end**: a Next.js BullMQ enqueue is consumed from Rust.
  BullMQ stores each job as a Redis hash `bull:{queue}:{jobId}` with the payload in the
  `data` field (plain JSON) — `ScrapeJobData` deserializes it directly. See
  `cargo run -p peep-queue --example consume_spike`.
  - **Data-plane**: trivial — JSON in/out, no custom format needed.
  - **Control-plane** (atomic wait→active move + lock + ack) for real consumption:
    use `bullmq-rs` or the BullMQ `moveToActive` Lua scripts. Decision deferred to R1;
    Redis Streams + a tiny TS shim is the fallback if interop proves rough at scale.

## Next (R1)
HTTP scrape path in `peep-core` (`fetcher` → `block_detect` → `readability` →
`markdown` → `links` → `change_tracking`) behind a queue-routing flag, gated on the
differential parity harness vs the TS `runScrapeWithStrategy`.
