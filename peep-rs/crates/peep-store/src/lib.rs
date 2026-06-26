//! peep-store — Postgres writes via sqlx (added R1).
//!
//! Writes the same rows the TS workers do (ScrapeJob, ScrapeResult, CrawlJob,
//! BatchJob, CreditLedger, ChangeSnapshot) against the self-hosted Postgres.
//! Prisma owns the schema/migrations; this crate must NOT run migrations.
//! Mints cuid2 ids where Prisma uses app-generated `@default(cuid())`.
