import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, LaunchOptions } from "playwright";

// Apply stealth patches globally — blocks common bot-detection
// fingerprints (navigator.webdriver, plugins array, languages,
// WebGL vendor, etc.). Runs once at import time.
chromium.use(StealthPlugin());

// UA pool matched with correct Sec-CH-UA headers. Phase 7 hardens
// this further with per-request rotation + Sec-CH-UA-Platform parity.
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

// Launch a stealth-patched Chromium instance. Caller is responsible
// for closing it (the BrowserPool does this via lifecycle management).
export async function launchStealth(
  opts?: LaunchOptions & { proxyServer?: string },
): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      ...(opts?.proxyServer
        ? [`--proxy-server=${opts.proxyServer}`]
        : []),
    ],
    ...opts,
  });
}
