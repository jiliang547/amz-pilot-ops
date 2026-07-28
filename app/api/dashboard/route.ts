import { assertSameOrigin, requireUser } from "@/lib/auth";
import { dashboardData, runManualReportSnapshot } from "@/lib/snapshot-reports";
import { d1, ensureSchema } from "@/lib/db";

export async function GET(request: Request) {
  try {
    await ensureSchema();
    const user = await requireUser(request);
    const accountId = new URL(request.url).searchParams.get("accountId");
    if (!accountId) return Response.json({ error: "请选择店铺" }, { status: 400 });
    const account = await d1().prepare(`SELECT id,name,timezone,currency FROM accounts WHERE id=? AND user_id=?`).bind(accountId, user.id).first<Record<string, unknown>>();
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
    const refresh = await runManualReportSnapshot(user.id, body.accountId);
    const account = await d1().prepare(`SELECT id,name,timezone,currency FROM accounts WHERE id=? AND user_id=?`).bind(body.accountId, user.id).first<Record<string, unknown>>();
    if (!account) return Response.json({ error: "店铺不存在" }, { status: 404 });
    return Response.json({ account, refresh, ...(await dashboardData(user.id, body.accountId)) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "手动刷新失败" }, { status: 400 });
  }
}