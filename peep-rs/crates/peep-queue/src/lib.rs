//! peep-queue — BullMQ/Redis interop (added in the R0 spike).
//!
//! Consumes the existing `scrape`/`crawl`/`batch` BullMQ queues that Next.js
//! enqueues to, and publishes completion on `scrape:done:{id}` /
//! `crawl:event:{id}`. Also owns the rate-limit + cache key conventions.
//! Queue names: scrape, crawl, extract, batch, webhook (src/lib/queue.ts).

/// Queue names — must match `src/lib/queue.ts` exactly.
pub const QUEUE_SCRAPE: &str = "scrape";
pub const QUEUE_CRAWL: &str = "crawl";
pub const QUEUE_EXTRACT: &str = "extract";
pub const QUEUE_BATCH: &str = "batch";
pub const QUEUE_WEBHOOK: &str = "webhook";

/// Pub/sub channel for a finished scrape (sync-mode callers + crawl worker).
pub fn scrape_done_channel(job_id: &str) -> String {
    format!("scrape:done:{job_id}")
}

/// Pub/sub channel for crawl progress (SSE stream).
pub fn crawl_event_channel(job_id: &str) -> String {
    format!("crawl:event:{job_id}")
}

use peep_contracts::ScrapeJobData;

/// BullMQ stores each job as a Redis hash at `bull:{queue}:{jobId}` with the
/// payload in the `data` field (verified against a real Next.js enqueue). This
/// reads + deserializes that payload into our wire contract — the data-plane
/// half of the interop. The control-plane (atomic wait→active move + lock + ack)
/// is provided by `bullmq-rs` or the BullMQ Lua scripts, wired in R1.
pub async fn read_scrape_job_data(
    conn: &mut redis::aio::MultiplexedConnection,
    queue: &str,
    job_id: &str,
) -> anyhow::Result<ScrapeJobData> {
    let key = format!("bull:{queue}:{job_id}");
    let data: Option<String> = redis::cmd("HGET")
        .arg(&key)
        .arg("data")
        .query_async(conn)
        .await?;
    let data = data.ok_or_else(|| anyhow::anyhow!("no job hash at {key}"))?;
    Ok(serde_json::from_str(&data)?)
}
