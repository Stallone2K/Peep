import { db } from "@/lib/db";
import { requireSession } from "@/lib/session-auth";
import { toJsonError } from "@/lib/errors";

// GET /api/dashboard/credit-usage/historical?days=30
// Daily time-series of credit movement for the Usage page sparkline.
// Returns an array of { date: "YYYY-MM-DD", spent, granted } entries,
// oldest first, length exactly `days` (missing days filled with zeros).
export async function GET(req: Request) {
  try {
    const { userId } = await requireSession();
    const url = new URL(req.url);
    const daysParam = Number(url.searchParams.get("days") ?? "30");
    const days = Number.isFinite(daysParam)
      ? Math.min(365, Math.max(1, Math.floor(daysParam)))
      : 30;

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));

    const rows = await db.creditLedger.findMany({
      where: { userId, createdAt: { gte: start } },
      select: { delta: true, createdAt: true },
    });

    // Bucket by YYYY-MM-DD
    const buckets = new Map<string, { spent: number; granted: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, { spent: 0, granted: 0 });
    }
    for (const r of rows) {
      const key = r.createdAt.toISOString().slice(0, 10);
      const b = buckets.get(key);
      if (!b) continue;
      if (r.delta < 0) b.spent += Math.abs(r.delta);
      else b.granted += r.delta;
    }

    const series = Array.from(buckets.entries()).map(([date, v]) => ({
      date,
      spent: v.spent,
      granted: v.granted,
    }));

    return Response.json({ success: true, data: { days, series } });
  } catch (err) {
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}
