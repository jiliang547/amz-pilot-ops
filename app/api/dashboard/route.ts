import { assertSameOrigin, requireUser } from "@/lib/auth";
import { dashboardData, runManualReportSnapshots } from "@/lib/snapshot-reports";
import { effectiveTimezone } from "@/lib/timezone";
import { d1, ensureSchema } from "@/lib/db";

async function ownedAccount(userId: string, accountId: string) {
  const account = await d1().prepare(`SELECT id,name,timezone,marketplace,region,currency FROM accounts WHERE id=? AND user_id=?`).bind(accountId, userId).first<Record<string, unknown>>();
  if (account) account.timezone = effectiveTimezone(account);
  return account;
}

export async function GET(request: Request) {
  try {
    await ensureSchema();
    const user = await requireUser(request);
    const accountId = new URL(request.url).searchParams.get("accountId");
    if (!accountId) return Response.json({ error: "请选择店铺" }, { status: 400 });
    const account = await ownedAccount(user.id, accountId);
    if (!account) return Response.json({ error: "店铺不存在" }, { status: 404 });
    return Response.json({ account, ...(await dashboardData(user.id, accountId)) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "看板读取失败" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureSchema();
    const user = await requireUser(request);
    const body = await request.json() as { accountId?: string };
    if (!body.accountId) return Response.json({ error: "请选择店铺" }, { status: 400 });
    const account = await ownedAccount(user.id, body.accountId);
    if (!account) return Response.json({ error: "店铺不存在" }, { status: 404 });
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        void (async () => {
          try {
            const refresh = await runManualReportSnapshots(user.id, body.accountId!, text => send("status", { text }));
            send("done", { account, refresh, ...(await dashboardData(user.id, body.accountId!)) });
          } catch (error) {
            send("error", { message: error instanceof Error ? error.message : "手动拉取报表失败" });
          } finally {
            controller.close();
          }
        })();
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "手动拉取报表失败" }, { status: 400 });
  }
}
