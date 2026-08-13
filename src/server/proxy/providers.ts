// Proxy tier providers. `basic` = no proxy (direct egress). `stealth`
// = Bright Data residential pool (requires BRIGHTDATA_PROXY_URL env).
// `auto` = start basic, escalate to stealth on block detection.

export type ProxyTier = "basic" | "stealth" | "enhanced" | "auto";

export type ProxyConfig = {
  server: string;
  username?: string;
  password?: string;
};

export function isStealthAvailable(): boolean {
  return !!process.env.BRIGHTDATA_PROXY_URL;
}

export function getProxyConfig(
  tier: ProxyTier,
  opts: { country?: string } = {},
): ProxyConfig | null {
  if (tier === "basic") return null;

  if (tier === "stealth" || tier === "enhanced") {
    const url = process.env.BRIGHTDATA_PROXY_URL;
    if (!url) return null;
    try {
      const parsed = new URL(url);
      let username = parsed.username || undefined;
      // Bright Data geo-targeting: appending `-country-<cc>` to the
      // zone username routes the session through that country's pool.
      // This is how `location.country` takes effect (proxied requests
      // only — direct egress has no geo control).
      const country = opts.country?.trim().toLowerCase();
      if (username && country && /^[a-z]{2}$/.test(country)) {
        username = `${username}-country-${country}`;
      }
      return {
        server: `${parsed.protocol}//${parsed.host}`,
        username,
        password: parsed.password || undefined,
      };
    } catch {
      return null;
    }
  }

  // "auto" — start without proxy; caller escalates if block detected
  return null;
}

// Credit bonus for using stealth proxy (Firecrawl parity §11.12).
export const STEALTH_CREDIT_BONUS = 4;
