import "dotenv/config";
import { runScrapeWithStrategy } from "@/server/scraper/strategy";
async function main() {
  console.log("START");
  const r: any = await runScrapeWithStrategy({
    url: "https://shownomore.com",
    formats: [{ type: "branding" }],
    onlyMainContent: false, onlyCleanContent: false,
    timeout: 30000, waitFor: 0, mobile: false,
    removeBase64Images: true, fastMode: false, blockAds: true,
    proxy: "auto", storeInCache: false, async: false, respectRobotsTxt: false,
  } as any);
  console.log("ENGINE:", r.engineUsed);
  console.log("COLORS:", JSON.stringify(r.branding?.colors));
  console.log("FONTS:", JSON.stringify(r.branding?.fonts));
  console.log("END");
}
main().catch((e) => { console.log("ERR:", e?.message || String(e)); process.exit(1); });
