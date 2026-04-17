import { z } from "zod";

import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/api-auth";
import { crawlStatusQuerySchema } from "@/lib/validators/crawl";
import {
  NotFoundError,
  ValidationError,
  toJsonError,
} from "@/lib/errors";

// GET /api/v1/crawl/:id?next=cursor&limit=100
// Returns status + paginated child results. `next` is a ScrapeJob.id
// cuid used as an opaque cursor (cuids sort lexicographically in
// creation order).
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireApiKey(req);
    const { id } = await context.params;

    const crawl = await db.crawlJob.findFirst({
      where: { id, userId },
    });
    if (!crawl) throw new NotFoundError("Crawl job");

    const url = new URL(req.url);
    const query = crawlStatusQuerySchema.parse({
      next: url.searchParams.get("next") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    // Only return children that have finished — callers polling this
    // endpoint don't want mid-flight scrape rows with null results.
    const children = await db.scrapeJob.findMany({
      where: {
        crawlJobId: id,
        status: { in: ["DONE", "FAILED"] },
        ...(query.next ? { id: { gt: query.next } } : {}),
      },
      orderBy: { id: "asc" },
      take: query.limit + 1, // sentinel for next cursor
      include: { result: true },
    });

    const hasMore = children.length > query.limit;
    const page = hasMore ? children.slice(0, query.limit) : children;
    const nextCursor = hasMore ? page[page.length - 1]!.id : null;

    // Fresh totals from the DB — don't trust the crawl worker's
    // in-memory counter (its process can restart).
    const [completedCount, errorCount, creditsAgg] = await Promise.all([
      db.scrapeJob.count({
        where: { crawlJobId: id, status: { in: ["DONE", "FAILED"] } },
      }),
      db.scrapeJob.count({
        where: { crawlJobId: id, status: "FAILED" },
      }),
      db.scrapeJob.aggregate({
        where: { crawlJobId: id },
        _sum: { creditsUsed: true },
      }),
    ]);

    const data = page.map((child) => ({
      jobId: child.id,
      url: child.url,
      status: child.status.toLowerCase(),
      error: child.error,
      markdown: child.result?.markdown ?? null,
      html: child.result?.html ?? null,
      rawHtml: child.result?.rawHtml ?? null,
      links: child.result?.links ?? [],
      images: child.result?.images ?? [],
      screenshot: child.result?.screenshotR2Key ?? null,
      metadata: child.result?.metadata ?? null,
      pageStatus: child.result?.pageStatus ?? null,
      durationMs: child.result?.durationMs ?? null,
    }));

    return Response.json({
      success: true,
      status: crawl.status.toLowerCase(),
      total: crawl.totalDiscovered,
      completed: completedCount,
      errorCount,
      creditsUsed: creditsAgg._sum.creditsUsed ?? 0,
      next: nextCursor,
      data,
      createdAt: crawl.createdAt,
      completedAt: crawl.completedAt,
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

// DELETE /api/v1/crawl/:id
// Flip status → CANCELLED. Worker checks every ~10 iterations and
// exits cleanly on the next tick.
export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireApiKey(req);
    const { id } = await context.params;

    const crawl = await db.crawlJob.findFirst({
      where: { id, userId },
    });
    if (!crawl) throw new NotFoundError("Crawl job");

    if (crawl.status === "DONE" || crawl.status === "CANCELLED") {
      return Response.json({
        success: true,
        status: crawl.status.toLowerCase(),
      });
    }

    await db.crawlJob.update({
      where: { id },
      data: { status: "CANCELLED", completedAt: new Date() },
    });

    return Response.json({ success: true, status: "cancelled" });
  } catch (err) {
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}
