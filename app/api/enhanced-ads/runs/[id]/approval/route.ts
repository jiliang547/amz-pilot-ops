import { assertSameOrigin, requireUser } from "@/lib/auth";
import { appEnv, d1, ensureSchema } from "@/lib/db";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    await ensureSchema();
    const { id } = await context.params;
    const body = await request.json() as { approved?: boolean };
    const run = await d1().prepare(`SELECT id,status FROM enhanced_ads_runs WHERE id=? AND user_id=?`).bind(id, user.id).first<{ id: string; status: string }>();
    if (!run) return Response.json({ error: "运行记录不存在" }, { status: 404 });
    if (run.status !== "waiting_approval") return Response.json({ error: "当前运行没有待确认操作" }, { status: 409 });
    const workflow = appEnv().ENHANCED_ADS_WORKFLOW;
    if (!workflow) throw new Error("增强型智能广告 Workflow 尚未绑定");
    const instance = await workflow.get(id);
    await instance.sendEvent({ type: "approval", payload: { approved: body.approved === true } });
    await d1().prepare(`UPDATE enhanced_ads_runs SET status='running',stage='approval_received',updated_at=? WHERE id=? AND user_id=?`).bind(Date.now(), id, user.id).run();
    return Response.json({ ok: true, approved: body.approved === true });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "提交审批失败" }, { status: 400 });
  }
}
