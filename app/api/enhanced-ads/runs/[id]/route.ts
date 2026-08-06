import { requireUser } from "@/lib/auth";
import { d1, ensureSchema } from "@/lib/db";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    await ensureSchema();
    const { id } = await context.params;
    const run = await d1().prepare(`SELECT id,account_id accountId,conversation_id conversationId,prompt,status,stage,round,tool_count toolCount,answer,error,approval_json approvalJson,created_at createdAt,updated_at updatedAt,completed_at completedAt FROM enhanced_ads_runs WHERE id=? AND user_id=?`).bind(id, user.id).first<Record<string, unknown>>();
    if (!run) return Response.json({ error: "运行记录不存在" }, { status: 404 });
    const events = await d1().prepare(`SELECT id,event_type eventType,round,tool_name toolName,input_json inputJson,output_json outputJson,status,created_at createdAt FROM enhanced_ads_events WHERE run_id=? AND user_id=? ORDER BY created_at LIMIT 200`).bind(id, user.id).all();
    let approval: unknown = null;
    if (run.approvalJson) { try { approval = JSON.parse(String(run.approvalJson)); } catch { approval = null; } }
    return Response.json({ ...run, approval, approvalJson: undefined, events: events.results });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "读取运行状态失败" }, { status: 400 });
  }
}
