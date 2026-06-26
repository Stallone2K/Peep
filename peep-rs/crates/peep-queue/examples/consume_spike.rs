//! R0 queue-interop spike: read a real BullMQ-enqueued `scrape` job from Redis
//! and deserialize it into the shared contract.
//!
//! Run against the docker-compose Redis (host port 6380) after enqueuing a job
//! from Node:
//!   REDIS_URL=redis://localhost:6380 cargo run -p peep-queue --example consume_spike

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6380".into());
    let client = redis::Client::open(url)?;
    let mut conn = client.get_multiplexed_async_connection().await?;

    let job =
        peep_queue::read_scrape_job_data(&mut conn, peep_queue::QUEUE_SCRAPE, "demo123").await?;

    println!("✓ consumed BullMQ job from Rust");
    println!("  scrapeJobId = {}", job.scrape_job_id);
    println!("  url         = {}", job.input.url);
    println!("  formats     = {} format(s)", job.input.formats.len());
    println!("  proxy       = {:?}", job.input.proxy);
    Ok(())
}
