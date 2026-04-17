// Proxy tier providers. `basic` = no proxy (direct egress). `stealth`
// = Bright Data residential pool (requires BRIGHTDATA_PROXY_URL env).
// `auto` = start basic, escalate to stealth on block detection.

export type ProxyTier = "basic" | "stealth" | "enhanced" | "auto";

export type ProxyConfig = {
  server?: string;
  username?: string;
  password?: string;
};

export function isStealthAvailable(): boolean {
  return !!process.env.BRIGHTDATA_PROXY_URL;
}

export function getProxyConfig(tier: ProxyTier): ProxyConfig | null {
  if (tier === "basic") return null;

  if (tier === "stealth" || tier === "enhanced") {
    const url = process.env.BRIGHTDATA_PROXY_URL;
    if (!url) return null;
    try {
      const parsed = new URL(url);
      return {
        server: `${parsed.protocol}//${parsed.host}`,
        username: parsed.username || undefined,
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
