import { getProxyConfig, type ProxyConfig } from "@/server/proxy/providers";

// Bright Data adapter — wraps the generic stealth proxy config with
// Bright Data-specific branding + bandwidth accounting. The actual
// Playwright-level proxy wiring lives in scraper/browser.ts; this
// module exists so the stealth-tier cost surface is consolidated.
//
// Bright Data meters bandwidth (not requests), so every stealth
// scrape should log an estimated-cost line for ops visibility.
// We can't know the real cost until Bright Data's billing webhook
// fires, but a rough estimate (bytes × published rate) is enough to
// flag a runaway request in logs.

// Per Bright Data's published residential pricing — ~$8/GB at the
// cheapest tier. This is a floor; exact $/GB varies by zone + plan.
const BYTES_PER_USD_CENT = 125 * 1024; // ~$8/GB → 125KB per cent

export function getBrightDataProxy(): ProxyConfig | null {
  return getProxyConfig("stealth");
}

export function isBrightDataConfigured(): boolean {
  return getBrightDataProxy() !== null;
}

export function logBandwidthEstimate({
  url,
  bytesDown,
}: {
  url: string;
  bytesDown: number;
}): void {
  if (!isBrightDataConfigured()) return;
  const cents = Math.max(Math.ceil(bytesDown / BYTES_PER_USD_CENT), 1);
  console.log(
    `[brightdata] BANDWIDTH_ESTIMATE url=${url} bytes=${bytesDown} est_cost_cents=${cents}`,
  );
}
