//! peep-worker — the Rust queue consumer that replaces `src/workers/*` during
//! the strangler migration. Multi-queue tokio consumer (scrape → crawl → map →
//! batch). R0 scaffold: boots, logs, and verifies the contract/queue crates link.

use peep_contracts::ScrapeJobData;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber_init();
    tracing::info!(
        scrape_queue = peep_queue::QUEUE_SCRAPE,
        "peep-worker booted (R0 scaffold — no queue consumption yet)"
    );

    // Smoke-check that the wire contract deserializes as expected.
    let sample = r#"{"scrapeJobId":"demo","input":{"url":"https://example.com"}}"#;
    let job: ScrapeJobData = serde_json::from_str(sample)?;
    tracing::info!(job_id = %job.scrape_job_id, url = %job.input.url, "contract OK");

    Ok(())
}

/// Minimal stderr tracing without pulling extra deps yet; swapped for
/// `tracing-subscriber` + OTel in R5.
fn tracing_subscriber_init() {
    // no-op placeholder; tracing macros are compiled but unsubscribed.
}
