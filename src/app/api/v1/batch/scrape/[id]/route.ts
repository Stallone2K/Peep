import { z } from "zod";

import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/api-auth";
import { batchStatusQuerySchema } from "@/lib/validators/batch";
import {
  NotFoundError,
  ValidationError,
  toJsonError,
} from "@/lib/errors";

// GET /api/v1/batch/scrape/:id?next=cursor&limit=100
// Returns batch status + paginated child results. Cursor is the
// ScrapeJob.id cuid (sorts lexicographically in creation order).
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireApiKey(req);
    const { id } = await context.params;

    const batch = await db.batchJob.findFirst({
      where: { id, userId },
    });
    if (!batch) throw new NotFoundError("Batch job");

    const url = new URL(req.url);
    const query = batchStatusQuerySchema.parse({
      next: url.searchParams.get("next") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    const children = await db.scrapeJob.findMany({
      where: {
        batchJobId: id,
        status: { in: ["DONE", "FAILED"] },
        ...(query.next ? { id: { gt: query.next } } : {}),
      },
      orderBy: { id: "asc" },
      take: query.limit + 1,
      include: { result: true },
    });

    const hasMore = children.length > query.limit;
    const page = hasMore ? children.slice(0, query.limit) : children;
    const nextCursor = hasMore ? page[page.length - 1]!.id : null;

    const [completedCount, failedCount, creditsAgg] = await Promise.all([
      db.scrapeJob.count({
        where: { batchJobId: id, status: { in: ["DONE", "FAILED"] } },
      }),
      db.scrapeJob.count({
        where: { batchJobId: id, status: "FAILED" },
      }),
      db.scrapeJob.aggregate({
        where: { batchJobId: id },
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
      status: batch.status.toLowerCase(),
      total: batch.total,
      completed: completedCount,
      failed: failedCount,
      creditsUsed: creditsAgg._sum.creditsUsed ?? 0,
      next: nextCursor,
      data,
      createdAt: batch.createdAt,
      completedAt: batch.completedAt,
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
