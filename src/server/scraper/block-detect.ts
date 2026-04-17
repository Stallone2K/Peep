// Detect common anti-bot challenge pages in a response. Returns the
// provider name if blocked, or null if the response looks clean. Used
// by the engine picker to decide whether to escalate from HTTP → PW
// → proxy-PW.

export type BlockResult = {
  blocked: boolean;
  provider?: "cloudflare" | "datadome" | "perimeterx" | "unknown";
};

const SIGNATURES: Array<{
  name: BlockResult["provider"];
  patterns: RegExp[];
  statusCodes?: number[];
}> = [
  {
    name: "cloudflare",
    patterns: [
      /cf-ray/i,
      /Just a moment\.\.\./i,
      /Checking your browser/i,
      /cloudflare/i,
      /_cf_chl_opt/i,
    ],
    statusCodes: [403, 503],
  },
  {
    name: "datadome",
    patterns: [
      /datadome/i,
      /dd\.?\s?captcha/i,
      /geo\.captcha-delivery\.com/i,
    ],
    statusCodes: [403],
  },
  {
    name: "perimeterx",
    patterns: [
      /_px\b/i,
      /perimeterx/i,
      /px-captcha/i,
      /human-challenge/i,
    ],
    statusCodes: [403, 429],
  },
];

export function detectBlock(
  html: string,
  statusCode: number,
  headers: Record<string, string>,
): BlockResult {
  // Quick exit on healthy 2xx responses that don't look like challenges
  if (statusCode >= 200 && statusCode < 300) {
    // Some bot pages return 200 but with a challenge body — still check
    // the signature patterns.
  }

  for (const sig of SIGNATURES) {
    // Status code mismatch → skip this provider (don't flag 200s as
    // Cloudflare unless the body actually matches)
    if (
      sig.statusCodes &&
      statusCode >= 200 &&
      statusCode < 300 &&
      !sig.statusCodes.includes(statusCode)
    ) {
      // Only skip status-code check on 2xx — on 4xx/5xx we always
      // check patterns
      const body = html.slice(0, 10_000); // only scan the first 10KB
      const anyMatch = sig.patterns.some((p) => p.test(body));
      if (anyMatch) return { blocked: true, provider: sig.name };
      continue;
    }

    // On non-2xx responses, check both status + body
    const bodySlice = html.slice(0, 10_000);
    const bodyMatch = sig.patterns.some((p) => p.test(bodySlice));
    const statusMatch =
      !sig.statusCodes || sig.statusCodes.includes(statusCode);

    if (bodyMatch && statusMatch) {
      return { blocked: true, provider: sig.name };
    }
  }

  // Headers-only check for cloudflare (cf-ray without body match)
  if (
    headers["cf-ray"] &&
    (statusCode === 403 || statusCode === 503)
  ) {
    return { blocked: true, provider: "cloudflare" };
  }

  // Generic block heuristic — 403/429/503 with very short body
  if (
    [403, 429, 503].includes(statusCode) &&
    html.length < 2000
  ) {
    return { blocked: true, provider: "unknown" };
  }

  return { blocked: false };
}
