import { requireApiKey } from "@/lib/api-auth";
import { mapRequestSchema } from "@/lib/validators/map";
import { ValidationError } from "@/lib/errors";
import { errorResponse, preflight, successJson } from "@/lib/route-helpers";
import { performMapForUser } from "@/server/map-service";

// POST /api/v1/map — synchronous URL discovery.
// Combines sitemap (sitemap.xml + robots.txt Sitemap: entries) with a
// shallow crawl (homepage → same-origin anchor hrefs). Never spins up
// BullMQ — runs entirely in the request handler for low latency. Flat
// 1 credit per call regardless of how many URLs come back.
export async function POST(req: Request) {
  try {
    const { userId, planTier } = await requireApiKey(req);
    await preflight(userId, planTier);

    const rawBody = await req.json().catch(() => {
      throw new ValidationError({ reason: "Invalid JSON body" });
    });
    const input = mapRequestSchema.parse(rawBody);

    const { links } = await performMapForUser({ userId, input });
    return await successJson(
      { success: true, links },
      { userId, creditsUsed: 1 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
