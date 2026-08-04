import { assertSameOrigin, requireUser } from "@/lib/auth";
import { getReplenishmentSnapshot } from "@/lib/store-replenishment";

const encoder = new TextEncoder();
const sse = (event: string, data: unknown) => encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const snapshot = await getReplenishmentSnapshot(user.id, text => controller.enqueue(sse("status", { text })));
          controller.enqueue(sse("result", snapshot));
          controller.enqueue(sse("done", { ok: true }));
        } catch (error) {
          controller.enqueue(sse("error", { message: error instanceof Error ? error.message : "补货预估失败" }));
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "补货预估失败" }, { status: 400 });
  }
}
