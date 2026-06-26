//! Wire-compatible contracts shared between the TypeScript app and the Rust core.
//!
//! These structs must (de)serialize to the **exact JSON** the TS side produces,
//! since they cross the BullMQ queue and Postgres `Json` columns. Field names are
//! camelCase to match `src/lib/validators/*.ts` and `src/server/scraper/strategy.ts`.
//! Anything optional/AI-shaped is kept as `serde_json::Value` so forward-compat
//! formats round-trip untouched.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

// ─── Defaults (mirror the zod `.default(...)` values in scrape.ts) ───────────
fn default_true() -> bool {
    true
}
fn default_timeout() -> u64 {
    30_000
}
fn default_proxy() -> ProxyTier {
    ProxyTier::Auto
}
fn default_formats() -> Vec<Format> {
    vec![Format::Markdown]
}

/// `proxy` enum — `src/lib/validators/scrape.ts:155`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProxyTier {
    Basic,
    Stealth,
    Enhanced,
    Auto,
}

/// Optional screenshot viewport.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Viewport {
    pub width: u32,
    pub height: u32,
}

/// One `{selector, attribute}` pair for the `attributes` format.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttributeSelector {
    pub selector: String,
    pub attribute: String,
}

/// Output-format objects — internally tagged by `type`, matching the zod union
/// in `scrape.ts:66`. Tag values are camelCase (`rawHtml`, `changeTracking`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Format {
    Markdown,
    Html,
    RawHtml,
    Links,
    Images,
    #[serde(rename_all = "camelCase")]
    Screenshot {
        #[serde(default)]
        full_page: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        quality: Option<u32>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        viewport: Option<Viewport>,
    },
    Json {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        schema: Option<Value>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        prompt: Option<String>,
    },
    Summary,
    Branding,
    Audio,
    Attributes {
        selectors: Vec<AttributeSelector>,
    },
    #[serde(rename_all = "camelCase")]
    Query {
        prompt: String,
        #[serde(default)]
        direct_quote: bool,
    },
    ChangeTracking {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        prompt: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        schema: Option<Value>,
        #[serde(default)]
        modes: Vec<String>,
        #[serde(default)]
        tag: Option<String>,
    },
}

/// Nested `location` object — `scrape.ts:162`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Location {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub languages: Option<Vec<String>>,
}

/// Top-level `extract` shorthand — `scrape.ts:175`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractShorthand {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schema: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub system_prompt: Option<String>,
}

/// Full scrape request — wire-compatible with `ScrapeRequestInput`
/// (`src/lib/validators/scrape.ts:136`). `actions` is kept as raw `Value` for
/// now; the render sidecar owns its interpretation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrapeRequestInput {
    pub url: String,
    #[serde(default = "default_formats")]
    pub formats: Vec<Format>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub headers: Option<HashMap<String, String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub include_tags: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exclude_tags: Option<Vec<String>>,
    #[serde(default = "default_true")]
    pub only_main_content: bool,
    #[serde(default)]
    pub only_clean_content: bool,
    #[serde(default = "default_timeout")]
    pub timeout: u64,
    #[serde(default)]
    pub wait_for: u64,
    #[serde(default)]
    pub mobile: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skip_tls_verification: Option<bool>,
    #[serde(default = "default_true")]
    pub remove_base64_images: bool,
    #[serde(default)]
    pub fast_mode: bool,
    #[serde(default = "default_true")]
    pub block_ads: bool,

    #[serde(default = "default_proxy")]
    pub proxy: ProxyTier,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub languages: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub location: Option<Location>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actions: Option<Vec<Value>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extract: Option<ExtractShorthand>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_age: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_age: Option<u64>,
    #[serde(default = "default_true")]
    pub store_in_cache: bool,

    // `async` is a Rust keyword — keep the wire name via rename.
    #[serde(rename = "async", default)]
    pub is_async: bool,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub integration: Option<String>,
    #[serde(default = "default_true")]
    pub respect_robots_txt: bool,
}

/// Which engine actually served the page — `strategy.ts` `engineUsed`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum EngineUsed {
    Http,
    Playwright,
    ProxyPlaywright,
}

/// changeTracking sub-result — `change-tracking.ts`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeTrackingResult {
    pub status: String, // new | same | changed | removed
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diff: Option<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

/// Result of `runScrapeWithStrategy` — `src/server/scraper/strategy.ts:43`.
/// AI-shaped fields stay as `Value` so they round-trip without a schema lock.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrapeResult {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub markdown: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub html: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub raw_html: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub links: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub images: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub screenshot: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub json: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub branding: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub change_tracking: Option<ChangeTrackingResult>,

    pub metadata: Value,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extracted: Option<Value>,
    pub page_status: i32,
    pub duration_ms: i64,
    pub engine_used: EngineUsed,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proxy_used: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action_results: Option<Vec<Value>>,
}

/// BullMQ `scrape` job payload — `src/workers/scrape.worker.ts:15`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrapeJobData {
    pub scrape_job_id: String,
    pub input: ScrapeRequestInput,
}

/// Completion notice published on `scrape:done:{jobId}` — worker line 109.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScrapeDoneMessage {
    #[serde(rename = "jobId")]
    pub job_id: String,
    pub status: String, // DONE | FAILED
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scrape_request_defaults_match_zod() {
        // Minimal input → all zod defaults applied on deserialize.
        let v: ScrapeRequestInput = serde_json::from_str(r#"{"url":"https://x.com"}"#).unwrap();
        assert_eq!(v.formats.len(), 1);
        assert!(matches!(v.formats[0], Format::Markdown));
        assert!(v.only_main_content);
        assert_eq!(v.timeout, 30_000);
        assert!(v.remove_base64_images);
        assert!(v.block_ads);
        assert_eq!(v.proxy, ProxyTier::Auto);
        assert!(v.store_in_cache);
        assert!(v.respect_robots_txt);
        assert!(!v.is_async);
    }

    #[test]
    fn format_tag_names_are_camel_case() {
        let f: Format = serde_json::from_str(r#"{"type":"rawHtml"}"#).unwrap();
        assert!(matches!(f, Format::RawHtml));
        let ct: Format =
            serde_json::from_str(r#"{"type":"changeTracking","modes":["git-diff"]}"#).unwrap();
        match ct {
            Format::ChangeTracking { modes, .. } => assert_eq!(modes, vec!["git-diff"]),
            _ => panic!("expected changeTracking"),
        }
    }

    #[test]
    fn screenshot_full_page_round_trips_camel() {
        let json = r#"{"type":"screenshot","fullPage":true,"quality":80}"#;
        let f: Format = serde_json::from_str(json).unwrap();
        let back = serde_json::to_string(&f).unwrap();
        assert!(back.contains("\"fullPage\":true"));
        assert!(back.contains("\"type\":\"screenshot\""));
    }

    #[test]
    fn job_data_uses_camel_case_id() {
        let jd: ScrapeJobData = serde_json::from_str(
            r#"{"scrapeJobId":"abc","input":{"url":"https://x.com"}}"#,
        )
        .unwrap();
        assert_eq!(jd.scrape_job_id, "abc");
        assert_eq!(jd.input.url, "https://x.com");
    }
}
