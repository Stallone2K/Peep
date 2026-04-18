import { BraveSearchProvider } from "@/server/search/brave";
import { DuckDuckGoSearchProvider } from "@/server/search/ddg";
import type { SearchProvider } from "@/server/search/provider";

// Resolve which search backend /api/v1/search should use. Priority:
//   1. Explicit SEARCH_PROVIDER env (`brave` | `duckduckgo`)
//   2. BRAVE_SEARCH_API_KEY set → Brave (paid, higher quality)
//   3. Fall back to keyless DuckDuckGo HTML scraper — always works
//      in dev without any signup.
export function resolveSearchProvider(): SearchProvider {
  const preference = (process.env.SEARCH_PROVIDER ?? "").toLowerCase();

  if (preference === "brave") return new BraveSearchProvider();
  if (preference === "duckduckgo" || preference === "ddg") {
    return new DuckDuckGoSearchProvider();
  }

  // Auto-detect: Brave if keyed, otherwise DDG.
  if (process.env.BRAVE_SEARCH_API_KEY) return new BraveSearchProvider();
  return new DuckDuckGoSearchProvider();
}
