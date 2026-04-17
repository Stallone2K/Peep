import { db } from "@/lib/db";
import { debitCredits, refundCredits } from "@/lib/credits";
import { extractQueue, getRedisConnection } from "@/lib/queue";
import type { ExtractRequestInput } from "@/lib/validators/extract";
import { runScrapeWithStrategy } from "@/server/scraper/strategy";
import {
  extractStructured,
  ExtractionValidationError,
} from "@/server/ai/extract";
import { inferSchemaAndExtract } from "@/server/ai/infer-schema";

// Credit cost: 4 per URL processed (matches Firecrawl's json format
// surcharge). Plus 1 baseline scrape cost per URL.
const CREDITS_PER_URL = 5;

export type ExtractJobData = {
  extractJobId: string;
  input: ExtractRequestInput;
};

export async function startExtractJob({
  userId,
  apiKeyId,
  input,
}: {
  userId: string;
  apiKeyId: string | null;
  input: ExtractRequestInput;
}): Promise<{ jobId: string; creditsReserved: number }> {
  const resolvedUrls = await resolveUrls(input);
  const creditsNeeded = Math.max(1, resolvedUrls.length) * CREDITS_PER_URL;

  await debitCredits(userId, creditsNeeded, {
    reason: "extract",
    refType: "ExtractJob",
  });

  const job = await db.extractJob.create({
    data: {
      userId,
      apiKeyId,
      urls: resolvedUrls,
      prompt: input.prompt,
      systemPrompt: input.systemPrompt,
      schema: (input.schema as never) ?? null,
      enableWebSearch: input.enableWebSearch,
      status: "QUEUED",
      creditsUsed: creditsNeeded,
      integration: input.integration,
    },
  });

  const jobData: ExtractJobData = { extractJobId: job.id, input };
  await extractQueue().add(`extract-${job.id}`, jobData, { jobId: job.id });

  return { jobId: job.id, creditsReserved: creditsNeeded };
}

// Resolve wildcard URLs like `example.com/*` into a concrete list.
// Phase 6 will hook the real /map endpoint here. For Phase 5 MVP we
// treat wildcards literally (the worker just scrapes the base URL).
async function resolveUrls(input: ExtractRequestInput): Promise<string[]> {
  if (!input.urls) return [];
  return input.urls.map((u) => u.replace(/\/\*+$/, ""));
}

// Worker-side executor. Scrapes each URL → runs the AI extraction
// (schema or schema-free). Writes aggregated result to ExtractJob.
export async function runExtractJob(
  extractJobId: string,
  input: ExtractRequestInput,
): Promise<void> {
  await db.extractJob.update({
    where: { id: extractJobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  try {
    const urls = input.urls ?? [];
    const perUrl: Array<Record<string, unknown>> = [];
    const combinedMarkdown: string[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const url of urls) {
      const cleanUrl = url.replace(/\/\*+$/, "");
      try {
        const scrape = await runScrapeWithStrategy({
          url: cleanUrl,
          formats: [{ type: "markdown" }],
          onlyMainContent: true,
          onlyCleanContent: false,
          timeout: 30_000,
          waitFor: 0,
          mobile: false,
          removeBase64Images: true,
          fastMode: false,
          blockAds: true,
          proxy: "auto",
          storeInCache: true,
          async: false,
        } as never);
        const md = (scrape.markdown ?? "").trim();
        if (md) {
          combinedMarkdown.push(`# ${cleanUrl}\n\n${md}`);
          perUrl.push({ url: cleanUrl, markdown: md.length });
        }
      } catch (err) {
        if (!input.ignoreInvalidURLs) throw err;
        perUrl.push({
          url: cleanUrl,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Prompt-only mode (no URLs) — not supported in Phase 5 MVP
    if (urls.length === 0) {
      throw new Error(
        "Prompt-only extraction (without URLs) requires Phase 7 /search integration",
      );
    }

    const mergedMd = combinedMarkdown.join("\n\n---\n\n");

    let result: unknown;
    let inferredSchema: unknown;

    if (input.schema) {
      const r = await extractStructured({
        markdown: mergedMd,
        schema: input.schema as Record<string, unknown>,
        prompt: input.prompt,
        systemPrompt: input.systemPrompt,
      });
      result = r.data;
      if (r.tokensUsed) {
        totalInputTokens += r.tokensUsed.input;
        totalOutputTokens += r.tokensUsed.output;
      }
    } else {
      const r = await inferSchemaAndExtract({
        markdown: mergedMd,
        prompt: input.prompt!,
      });
      result = r.data;
      inferredSchema = r.schema;
      if (r.tokensUsed) {
        totalInputTokens += r.tokensUsed.input;
        totalOutputTokens += r.tokensUsed.output;
      }
    }

    await db.extractJob.update({
      where: { id: extractJobId },
      data: {
        status: "DONE",
        completedAt: new Date(),
        result: {
          data: result,
          ...(inferredSchema ? { schema: inferredSchema } : {}),
          ...(input.urlTrace ? { sources: perUrl } : {}),
        } as never,
        tokensUsed: {
          input: totalInputTokens,
          output: totalOutputTokens,
        } as never,
      },
    });

    // Notify sync callers via Redis pub/sub
    await getRedisConnection().publish(
      `extract:done:${extractJobId}`,
      JSON.stringify({ jobId: extractJobId, status: "DONE" }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code =
      err instanceof ExtractionValidationError
        ? "EXTRACTION_SCHEMA_MISMATCH"
        : "EXTRACTION_FAILED";

    await db.extractJob
      .update({
        where: { id: extractJobId },
        data: {
          status: "FAILED",
          error: `${code}: ${message}`,
          completedAt: new Date(),
        },
      })
      .catch(() => {});

    // Refund on failure
    const job = await db.extractJob.findUnique({
      where: { id: extractJobId },
      select: { userId: true, creditsUsed: true },
    });
    if (job && job.creditsUsed > 0) {
      await refundCredits(job.userId, job.creditsUsed, {
        reason: "refund_failed_extract",
        refType: "ExtractJob",
        refId: extractJobId,
      }).catch(() => {});
    }

    await getRedisConnection()
      .publish(
        `extract:done:${extractJobId}`,
        JSON.stringify({ jobId: extractJobId, status: "FAILED", error: message }),
      )
      .catch(() => {});

    throw err;
  }
}
