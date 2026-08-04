import { assertSameOrigin, requireUser } from "@/lib/auth";
import { d1 } from "@/lib/db";
import { executeSpApiEndpoint, loadSpApiConnection, SpApiClient } from "@/lib/sp-api";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const { id } = await context.params;
    const row = await d1().prepare(`SELECT tool_args,status FROM approvals WHERE id=? AND user_id=? AND account_id=? AND tool_name='sp_api_execute'`)
      .bind(id, user.id, `spapi:${user.id}`).first<{ tool_args: string; status: string }>();
    if (!row) return Response.json({ error: "审批不存在" }, { status: 404 });
    if (row.status !== "pending") return Response.json({ error: `审批状态为 ${row.status}，不能重复执行` }, { status: 409 });
    const args = JSON.parse(row.tool_args) as { endpoint: string; parameters?: Record<string, unknown> };
    const result = await executeSpApiEndpoint(new SpApiClient(await loadSpApiConnection(user.id)), args.endpoint, args.parameters ?? {});
    await d1().prepare(`UPDATE approvals SET status='executed',result=?,executed_at=? WHERE id=? AND status='pending'`).bind(JSON.stringify(result).slice(0, 100_000), Date.now(), id).run();
    return Response.json({ ok: true, result });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "执行审批失败" }, { status: 400 });
  }
}
