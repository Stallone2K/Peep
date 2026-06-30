import { requireApiKey } from "@/lib/api-auth";
import { ValidationError } from "@/lib/errors";
import { searchRequestSchema } from "@/lib/validators/search";
import { performSearchForUser } from "@/server/search-service";
import { errorResponse, preflight, successJson } from "@/lib/route-helpers";

// POST /api/v1/search
// Provider-neutral web search. Default backend is Brave (or keyless
// DuckDuckGo fallback when no API key is set). Thin shell — all the
// caching / billing / enrichment lives in server/search-service.
export async function POST(req: Request) {
  try {
    const { userId, apiKeyId, planTier } = await requireApiKey(req);
    await preflight(userId, planTier);

    const rawBody = await req.json().catch(() => {
      throw new ValidationError({ reason: "Invalid JSON body" });
    });
    const input = searchRequestSchema.parse(rawBody);

    const { results, creditsUsed, cached } = await performSearchForUser({
      userId,
      apiKeyId,
      input,
    });

    return await successJson(
      {
        success: true,
        data: results,
        cached,
        creditsUsed,
      },
      { userId, creditsUsed },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
