import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/api-auth";
import { scrapeQueue } from "@/lib/queue";
import { batchScrapeRequestSchema } from "@/lib/validators/batch";
import { ValidationError } from "@/lib/errors";
import type { ScrapeJobData } from "@/workers/scrape.worker";
import type { ScrapeRequestInput } from "@/lib/validators/scrape";
import { scrapeRequestSchema } from "@/lib/validators/scrape";
import { errorResponse, preflight } from "@/lib/route-helpers";

// POST /api/v1/batch/scrape
// Parallel scrape of N URLs. Creates a BatchJob + N ScrapeJob
// children, enqueues each onto the `scrape` queue, returns
// { jobId, url, total }. Credits are debited by the scrape worker
// per child — creating the batch is free (parity with /crawl).
export async function POST(req: Request) {
  try {
    const { userId, apiKeyId, planTier } = await requireApiKey(req);
    await preflight(userId, planTier);

    const rawBody = await req.json().catch(() => {
      throw new ValidationError({ reason: "Invalid JSON body" });
    });
    const input = batchScrapeRequestSchema.parse(rawBody);

    // Normalize child scrape options — we need a full ScrapeRequestInput
    // per child. Merge per-batch scrapeOptions over the scrape defaults,
    // then fill in the URL.
    const batchJob = await db.batchJob.create({
      data: {
        userId,
        apiKeyId,
        total: input.urls.length,
        options: input as never,
        status: "QUEUED",
        webhookUrl: input.webhook?.url ?? null,
        webhookSecret: input.webhook?.secret ?? null,
        integration: input.integration,
      },
    });

    // Create children + enqueue. We do the DB inserts first (single
    // createMany) so a Redis hiccup halfway through doesn't leave us
    // with orphan DB rows.
    const childOptionsDefaults = scrapeRequestSchema.parse({
      url: input.urls[0],
      ...(input.scrapeOptions ?? {}),
    });

    const childrenData = input.urls.map((url) => ({
      userId,
      apiKeyId,
      batchJobId: batchJob.id,
      url,
      options: { ...childOptionsDefaults, url } as never,
      status: "QUEUED" as const,
      creditsUsed: 1,
      integration: input.integration,
    }));

    await db.scrapeJob.createMany({ data: childrenData });

    const created = await db.scrapeJob.findMany({
      where: { batchJobId: batchJob.id },
      select: { id: true, url: true },
    });

    // Enqueue each child on the scrape queue. The scrape worker's
    // post-completion hook rolls up into BatchJob.completed/failed.
    for (const child of created) {
      const jobData: ScrapeJobData = {
        scrapeJobId: child.id,
        input: { ...childOptionsDefaults, url: child.url } as ScrapeRequestInput,
      };
      await scrapeQueue().add(`scrape-${child.id}`, jobData, {
        jobId: child.id,
      });
    }

    const origin = new URL(req.url).origin;
    return Response.json({
      success: true,
      jobId: batchJob.id,
      url: `${origin}/api/v1/batch/scrape/${batchJob.id}`,
      total: input.urls.length,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
