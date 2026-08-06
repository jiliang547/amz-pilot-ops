import { assertSameOrigin, requireUser } from "@/lib/auth";
import { appEnv, d1, ensureSchema } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    await ensureSchema();
    const accountId = new URL(request.url).searchParams.get("accountId");
    if (!accountId) return Response.json({ error: "请先选择 Amazon Ads 店铺" }, { status: 400 });

    const conversation = await d1().prepare(`
      SELECT conversation_id conversationId, MAX(created_at) lastAt
      FROM enhanced_ads_messages
      WHERE user_id=? AND account_id=?
      GROUP BY conversation_id
      ORDER BY lastAt DESC
      LIMIT 1
    `).bind(user.id, accountId).first<{ conversationId: string; lastAt: number }>();
    if (!conversation) return Response.json({ conversationId: null, messages: [], run: null });

    const [messages, latestRun] = await Promise.all([
      d1().prepare(`SELECT id, role, content text, run_id runId, created_at createdAt FROM enhanced_ads_messages WHERE user_id=? AND account_id=? AND conversation_id=? ORDER BY created_at ASC LIMIT 200`).bind(user.id, accountId, conversation.conversationId).all(),
      d1().prepare(`SELECT id,account_id accountId,conversation_id conversationId,prompt,status,stage,round,tool_count toolCount,answer,error,approval_json approvalJson,created_at createdAt,updated_at updatedAt,completed_at completedAt FROM enhanced_ads_runs WHERE user_id=? AND account_id=? AND conversation_id=? ORDER BY created_at DESC LIMIT 1`).bind(user.id, accountId, conversation.conversationId).first<Record<string, unknown>>(),
    ]);
    let run: Record<string, unknown> | null = latestRun ?? null;
    if (run?.approvalJson) {
      try { run.approval = JSON.parse(String(run.approvalJson)); } catch { run.approval = null; }
      delete run.approvalJson;
    }
    if (run) {
      const events = await d1().prepare(`SELECT id,event_type eventType,round,tool_name toolName,status,created_at createdAt FROM enhanced_ads_events WHERE run_id=? AND user_id=? ORDER BY created_at DESC LIMIT 40`).bind(run.id, user.id).all();
      run.events = (events.results ?? []).reverse();
    }
    return Response.json({ conversationId: conversation.conversationId, messages: messages.results ?? [], run });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "读取增强型广告会话失败" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    if (user.mustChangePassword) return Response.json({ error: "首次登录必须先修改密码" }, { status: 428 });
    await ensureSchema();
    const body = await request.json() as { accountId?: string; conversationId?: string; message?: string };
    const prompt = body.message?.trim();
    if (!body.accountId) return Response.json({ error: "请先选择 Amazon Ads 店铺" }, { status: 400 });
    if (!prompt) return Response.json({ error: "请输入广告运营问题" }, { status: 400 });
    if (prompt.length > 20_000) return Response.json({ error: "单条问题不能超过 20,000 字" }, { status: 400 });
    const account = await d1().prepare(`SELECT id FROM accounts WHERE id=? AND user_id=?`).bind(body.accountId, user.id).first();
    if (!account) return Response.json({ error: "广告账户不存在或不属于当前用户" }, { status: 404 });
    const conversationId = body.conversationId || crypto.randomUUID();
    if (body.conversationId) {
      const owned = await d1().prepare(`SELECT id FROM enhanced_ads_runs WHERE conversation_id=? AND user_id=? LIMIT 1`).bind(conversationId, user.id).first();
      if (!owned) return Response.json({ error: "增强型广告对话不存在" }, { status: 404 });
      const running = await d1().prepare(`SELECT id FROM enhanced_ads_runs WHERE conversation_id=? AND user_id=? AND status IN ('queued','running','waiting_approval') LIMIT 1`).bind(conversationId, user.id).first();
      if (running) return Response.json({ error: "当前对话仍有任务在运行，请等待完成后再追问" }, { status: 409 });
    }
    const runId = crypto.randomUUID();
    const now = Date.now();
    await d1().batch([
      d1().prepare(`INSERT INTO enhanced_ads_runs(id,user_id,account_id,conversation_id,prompt,status,stage,round,tool_count,created_at,updated_at) VALUES(?,?,?,?,?,'queued','queued',0,0,?,?)`).bind(runId, user.id, body.accountId, conversationId, prompt, now, now),
      d1().prepare(`INSERT INTO enhanced_ads_messages(id,conversation_id,user_id,account_id,run_id,role,content,created_at) VALUES(?,?,?,?,?,'user',?,?)`).bind(crypto.randomUUID(), conversationId, user.id, body.accountId, runId, prompt, now),
      d1().prepare(`INSERT INTO enhanced_ads_events(id,run_id,user_id,account_id,event_type,status,created_at) VALUES(?,?,?,?,?,'queued',?)`).bind(crypto.randomUUID(), runId, user.id, body.accountId, "run.queued", now),
    ]);
    const workflow = appEnv().ENHANCED_ADS_WORKFLOW;
    if (!workflow) throw new Error("增强型智能广告 Workflow 尚未绑定");
    try {
      await workflow.create({ id: runId, params: { runId, userId: user.id, accountId: body.accountId, conversationId, prompt } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await d1().prepare(`UPDATE enhanced_ads_runs SET status='failed',stage='failed',error=?,updated_at=?,completed_at=? WHERE id=?`).bind(message.slice(0, 1000), Date.now(), Date.now(), runId).run();
      throw error;
    }
    return Response.json({ runId, conversationId, status: "queued" }, { status: 202 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "启动增强型智能广告失败" }, { status: 400 });
  }
}
