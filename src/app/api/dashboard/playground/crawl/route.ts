import { z } from "zod";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session-auth";
import { ValidationError, toJsonError } from "@/lib/errors";
import { crawlQueue } from "@/lib/queue";
import { crawlRequestSchema } from "@/lib/validators/crawl";
import { isAIConfigured } from "@/server/ai/client";
import { promptToCrawlConfig } from "@/server/ai/crawl-prompt";
import type { CrawlJobData } from "@/workers/crawl.worker";

// POST /api/dashboard/playground/crawl
// Session-authed mirror of /api/v1/crawl — same queue, same NL-prompt
// translation. Lets the Crawl playground launch a crawl without
// asking the user to paste a Bearer token.
export async function POST(req: Request) {
  try {
    const { userId } = await requireSession();

    const rawBody = await req.json().catch(() => {
      throw new ValidationError({ reason: "Invalid JSON body" });
    });
    let input = crawlRequestSchema.parse(rawBody);

    // Best-effort attribution to the user's most recent active key.
    const apiKey = await db.apiKey.findFirst({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    // NL prompt → crawl config (mirrors the Bearer-authed route).
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
        console.error("[crawl playground] prompt translation failed", err);
      }
    }

    const crawlJob = await db.crawlJob.create({
      data: {
        userId,
        rootUrl: input.url,
        options: {
          ...input,
          apiKeyId: apiKey?.id ?? null,
          aiSuggested,
          integration: "playground",
        } as never,
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
