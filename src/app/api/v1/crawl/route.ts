import { z } from "zod";

import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/api-auth";
import { crawlQueue } from "@/lib/queue";
import { crawlRequestSchema } from "@/lib/validators/crawl";
import { isAIConfigured } from "@/server/ai/client";
import { promptToCrawlConfig } from "@/server/ai/crawl-prompt";
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
    let input = crawlRequestSchema.parse(rawBody);

    // NL-prompted crawl: translate the prompt into config fields via
    // Gemini, then merge UNDER the explicit fields so caller-supplied
    // values always win. Silently no-op if AI isn't configured — the
    // crawl still runs with whatever fields the caller sent.
    let aiSuggested:
      | {
          includePaths?: string[];
          excludePaths?: string[];
          limit?: number;
          crawlEntireDomain?: boolean;
          allowSubdomains?: boolean;
          regexOnFullURL?: boolean;
        }
      | null = null;
    if (input.prompt && isAIConfigured()) {
      try {
        aiSuggested = await promptToCrawlConfig({
          rootUrl: input.url,
          prompt: input.prompt,
        });
        const rawFields = rawBody as Record<string, unknown>;
        input = {
          ...input,
          includePaths:
            rawFields.includePaths !== undefined
              ? input.includePaths
              : (aiSuggested.includePaths ?? input.includePaths),
          excludePaths:
            rawFields.excludePaths !== undefined
              ? input.excludePaths
              : (aiSuggested.excludePaths ?? input.excludePaths),
          limit:
            rawFields.limit !== undefined
              ? input.limit
              : (aiSuggested.limit ?? input.limit),
          crawlEntireDomain:
            rawFields.crawlEntireDomain !== undefined
              ? input.crawlEntireDomain
              : (aiSuggested.crawlEntireDomain ?? input.crawlEntireDomain),
          allowSubdomains:
            rawFields.allowSubdomains !== undefined
              ? input.allowSubdomains
              : (aiSuggested.allowSubdomains ?? input.allowSubdomains),
          regexOnFullURL:
            rawFields.regexOnFullURL !== undefined
              ? input.regexOnFullURL
              : (aiSuggested.regexOnFullURL ?? input.regexOnFullURL),
        };
      } catch (err) {
        console.error("[crawl] prompt translation failed, ignoring", err);
      }
    }

    const crawlJob = await db.crawlJob.create({
      data: {
        userId,
        rootUrl: input.url,
        options: { ...input, apiKeyId, aiSuggested } as never,
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
      streamUrl: `${origin}/api/v1/crawl/${crawlJob.id}/stream`,
      ...(aiSuggested ? { aiSuggested } : {}),
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
