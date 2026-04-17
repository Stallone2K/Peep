import { z } from "zod";

import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/api-auth";
import { crawlQueue } from "@/lib/queue";
import { crawlRequestSchema } from "@/lib/validators/crawl";
import type { CrawlJobData } from "@/workers/crawl.worker";
import { ValidationError, toJsonError } from "@/lib/errors";

// POST /api/v1/crawl
// Creates a CrawlJob row, enqueues into the `crawl` queue, returns
// `{ jobId, url: "/api/v1/crawl/:id" }`. Crawl itself only charges on
// each child scrape as it runs — creating the crawl is free (parity
// with Firecrawl, which lets callers plan before spending).
export async function POST(req: Request) {
  try {
    const { userId, apiKeyId } = await requireApiKey(req);

    const rawBody = await req.json().catch(() => {
      throw new ValidationError({ reason: "Invalid JSON body" });
    });
    const input = crawlRequestSchema.parse(rawBody);

    const crawlJob = await db.crawlJob.create({
      data: {
        userId,
        rootUrl: input.url,
        options: { ...input, apiKeyId } as never,
        status: "QUEUED",
      },
    });

    const jobData: CrawlJobData = {
      crawlJobId: crawlJob.id,
      input,
    };
    await crawlQueue().add(`crawl-${crawlJob.id}`, jobData, {
      jobId: crawlJob.id,
    });

    const origin = new URL(req.url).origin;
    return Response.json({
      success: true,
      jobId: crawlJob.id,
      url: `${origin}/api/v1/crawl/${crawlJob.id}`,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      const { body, status } = toJsonError(new ValidationError(err.issues));
      return Response.json(body, { status });
    }
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}
