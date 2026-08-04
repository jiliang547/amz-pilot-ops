import { assertSameOrigin, requireUser } from "@/lib/auth";
import { runStoreAgent } from "@/lib/store-agent";

const encoder = new TextEncoder();
const sse = (event: string, data: unknown) => encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = await request.json() as { message?: string; history?: Array<{ role: string; text: string }> };
    if (!body.message?.trim()) return Response.json({ error: "请输入店铺运营指令" }, { status: 400 });
    const history = (body.history ?? []).slice(-10).map(item => `${item.role === "user" ? "用户" : "Agent"}：${item.text}`).join("\n").slice(-12_000);
    const prompt = history ? `以下是同一对话的历史，仅用于理解上下文：\n${history}\n\n当前用户指令：${body.message.trim()}` : body.message.trim();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const result = await runStoreAgent(user.id, prompt, text => controller.enqueue(sse("status", { text })));
          if (result.type === "approval") controller.enqueue(sse("approval", result));
          else controller.enqueue(sse("answer", { text: result.content }));
          controller.enqueue(sse("done", { modelRounds: result.modelRounds }));
        } catch (error) {
          controller.enqueue(sse("error", { message: error instanceof Error ? error.message : "店铺 Agent 执行失败" }));
        } finally { controller.close(); }
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "请求失败" }, { status: 400 });
  }
}
