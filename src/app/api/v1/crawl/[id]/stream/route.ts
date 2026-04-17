import { verifyApiKey } from "@/lib/api-key";
import { db } from "@/lib/db";
import { getRedisConnection } from "@/lib/queue";
import { NotFoundError, UnauthorizedError, toJsonError } from "@/lib/errors";

// GET /api/v1/crawl/:id/stream
// Server-Sent Events endpoint that proxies Redis pub/sub events from
// `crawl:event:<id>` to the browser in EventStream format. The browser
// uses `new EventSource("/api/v1/crawl/:id/stream?token=peep_live_...")`
// — SSE can't attach Authorization headers, so auth goes via query
// param. Tokens are treated like headers — nothing gets logged out.
//
// Preferred over WebSockets because:
// - Native support in Next 16 via ReadableStream responses
// - No upgrade handshake, passes cleanly through Vercel + CDNs
// - The "watch my crawl" interaction is strictly server → client, so
//   WebSocket's bidirectional extra isn't earning its keep.

export const dynamic = "force-dynamic"; // SSE must never be cached
export const runtime = "nodejs"; // ioredis isn't edge-safe

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const url = new URL(req.url);
    const token =
      url.searchParams.get("token") ??
      extractBearer(req.headers.get("authorization"));

    if (!token) throw new UnauthorizedError();
    const { userId } = await verifyApiKey(token);

    const crawl = await db.crawlJob.findFirst({
      where: { id, userId },
      select: { id: true, status: true },
    });
    if (!crawl) throw new NotFoundError("Crawl job");

    const channel = `crawl:event:${id}`;
    const sub = getRedisConnection().duplicate();
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        // Emit a hello frame so the client knows the stream is open
        // and its current crawl status, even if no events fire for a
        // while (e.g. a long sitemap discovery at the top of the run).
        controller.enqueue(
          encoder.encode(
            `event: hello\ndata: ${JSON.stringify({
              crawlJobId: id,
              status: crawl.status.toLowerCase(),
            })}\n\n`,
          ),
        );

        // Heartbeat every 20s so proxies don't kill the connection.
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: heartbeat\n\n`));
          } catch {
            /* controller closed */
          }
        }, 20_000);

        const handleMessage = (_channel: string, message: string) => {
          try {
            const parsed = JSON.parse(message) as {
              event: string;
              data: unknown;
              at: string;
            };
            controller.enqueue(
              encoder.encode(
                `event: ${parsed.event}\ndata: ${JSON.stringify(parsed.data)}\n\n`,
              ),
            );
            // Close the stream once the crawl has finished — the
            // receiver's EventSource auto-reconnects, so terminating
            // cleanly here prevents a reconnect loop.
            if (parsed.event === "completed" || parsed.event === "failed") {
              clearInterval(heartbeat);
              void sub.unsubscribe(channel).catch(() => {});
              sub.disconnect();
              controller.close();
            }
          } catch {
            /* malformed publish — ignore */
          }
        };

        sub.on("message", handleMessage);

        try {
          await sub.subscribe(channel);
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({
                message: "Failed to subscribe to crawl events",
                reason: err instanceof Error ? err.message : String(err),
              })}\n\n`,
            ),
          );
          clearInterval(heartbeat);
          controller.close();
          return;
        }

        // Close cleanly if the client disconnects.
        req.signal.addEventListener("abort", () => {
          clearInterval(heartbeat);
          void sub.unsubscribe(channel).catch(() => {});
          sub.disconnect();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        });
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no", // disable nginx buffering
      },
    });
  } catch (err) {
    const { body, status } = toJsonError(err);
    return Response.json(body, { status });
  }
}

function extractBearer(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}
