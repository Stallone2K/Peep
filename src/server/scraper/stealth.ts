import { chromium } from "patchright";
import type { Browser, LaunchOptions } from "playwright";

// Patchright is a patched Playwright that fixes the CDP / fingerprint leaks
// modern anti-bot systems (Cloudflare, DataDome) detect — replacing the
// now-deprecated `puppeteer-extra-plugin-stealth`. The patches apply at the
// engine level automatically; we just launch via patchright's chromium and
// avoid leaky launch flags (notably NOT `--disable-blink-features=
// AutomationControlled`, which is itself a detection tell).

// UA pool matched with correct Sec-CH-UA headers.
export const USER_AGENTS = [
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    secChUa: '"Chromium";v="131", "Not_A Brand";v="24"',
    platform: "macOS",
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    secChUa: '"Chromium";v="131", "Not_A Brand";v="24"',
    platform: "Windows",
  },
  {
    ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    secChUa: '"Chromium";v="131", "Not_A Brand";v="24"',
    platform: "Linux",
  },
];

export function pickUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]!;
}

// Launch a patchright (anti-detect) Chromium instance. Caller closes it
// (the BrowserPool manages lifecycle).
export async function launchStealth(
  opts?: LaunchOptions & { proxyServer?: string },
): Promise<Browser> {
  const { proxyServer, ...rest } = opts ?? {};
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      ...(proxyServer ? [`--proxy-server=${proxyServer}`] : []),
    ],
    ...rest,
  });
  // patchright's Browser is structurally a playwright Browser.
  return browser as unknown as Browser;
}
