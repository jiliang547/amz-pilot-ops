import { requireUser } from "@/lib/auth";
import { d1, ensureSchema } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    await ensureSchema();
    const url = new URL(request.url);
    const agent = url.searchParams.get("agent");
    const runId = url.searchParams.get("runId");
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));
    const clauses = ["user_id=?", "created_at>=?"];
    const args: unknown[] = [user.id, Date.now() - 7 * 24 * 60 * 60 * 1000];
    if (agent === "ads" || agent === "store") { clauses.push("agent=?"); args.push(agent); }
    if (runId) { clauses.push("run_id=?"); args.push(runId); }
    const rows = await d1().prepare(`SELECT id,account_id accountId,agent,run_id runId,event_type eventType,round,tool_name toolName,input_json inputJson,output_json outputJson,status,created_at createdAt FROM agent_logs WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT ${limit}`).bind(...args).all();
    return Response.json({ retentionDays: 7, logs: rows.results });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "读取 Agent 日志失败" }, { status: 400 });
  }
}
