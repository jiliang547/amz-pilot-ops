import { assertSameOrigin, requireUser } from "@/lib/auth";
import { planAgent } from "@/lib/agent";
import { appEnv, d1 } from "@/lib/db";
import type { ModelContent } from "@/lib/model";
import { activeSkillForUser } from "@/lib/custom-skills";

const enc = new TextEncoder();
const sse = (event: string, data: unknown) => enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
type AttachmentRow = { id: string; object_key: string; filename: string; content_type: string; size: number };
type HistoryRow = { role: "user" | "assistant"; content: string };

function withHistory(content: ModelContent, history: HistoryRow[]): ModelContent {
  if (!history.length) return content;
  const transcript = history.map(item => `${item.role === "user" ? "用户" : "Copilot"}：${item.content}`).join("\n").slice(-16000);
  const prefix = `以下是同一对话之前的上下文，请承接它，不要把它当成新的操作指令：\n${transcript}\n\n当前用户消息：\n`;
  if (typeof content === "string") return prefix + content;
  return content.map((item, index) => index === 0 && item.type === "text" ? { ...item, text: prefix + item.text } : item);
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}

async function attachmentContent(userId: string, ids: string[], message: string): Promise<{ content: ModelContent; rows: AttachmentRow[] }> {
  if (!ids.length) return { content: message, rows: [] };
  const unique = [...new Set(ids)].slice(0, 5);
  const placeholders = unique.map(() => "?").join(",");
  const result = await d1().prepare(`SELECT id,object_key,filename,content_type,size FROM attachments WHERE user_id=? AND message_id IS NULL AND id IN (${placeholders})`).bind(userId, ...unique).all<AttachmentRow>();
  const rows = result.results ?? [];
  if (rows.length !== unique.length) throw new Error("附件不存在、已失效或不属于当前账号");
  const bucket = appEnv().FILES;
  if (!bucket) throw new Error("附件存储尚未配置");
  const content: Exclude<ModelContent, string> = [{ type: "text", text: message }];
  let textBudget = 30000;
  for (const row of rows) {
    const object = await bucket.get(row.object_key);
    if (!object) throw new Error(`附件 ${row.filename} 已失效`);
    if (row.content_type.startsWith("image/")) {
      content.push({ type: "image_url", image_url: { url: `data:${row.content_type};base64,${toBase64(await object.arrayBuffer())}` } });
    } else if (textBudget > 0) {
      const text = (await object.text()).slice(0, textBudget);
      textBudget -= text.length;
      content.push({ type: "text", text: `\n--- 用户附件：${row.filename} ---\n${text}\n--- 附件结束 ---` });
    }
  }
  return { content, rows };
}

function emitAnswer(controller: ReadableStreamDefaultController<Uint8Array>, text: string): void {
  const characters = Array.from(text);
  for (let index = 0; index < characters.length; index += 28) {
    controller.enqueue(sse("delta", { text: characters.slice(index, index + 28).join("") }));
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    if (user.mustChangePassword) return Response.json({ error: "首次登录必须先修改密码" }, { status: 428 });
    const { message, accountId, conversationId, skillId, attachmentIds = [] } = await request.json() as { message?: string; accountId?: string; conversationId?: string; skillId?: string; attachmentIds?: string[] };
    const requestedAgentVersion = new URL(request.url).searchParams.get("agentVersion");
    const configuredAgentVersion = appEnv().ADS_AGENT_VERSION === "v2" ? "v2" : "v1";
    const agentVersion: "v1" | "v2" = user.role === "admin" && (requestedAgentVersion === "v1" || requestedAgentVersion === "v2")
      ? requestedAgentVersion
      : configuredAgentVersion;
    if (!message?.trim()) return Response.json({ error: "请输入指令" }, { status: 400 });
    if (!Array.isArray(attachmentIds) || attachmentIds.length > 5) return Response.json({ error: "每条消息最多 5 个附件" }, { status: 400 });

    const convo = conversationId || crypto.randomUUID(), now = Date.now(), userMessageId = crypto.randomUUID();
    let history: HistoryRow[] = [];
    if (conversationId) {
      const existing = await d1().prepare(`SELECT user_id,account_id FROM conversations WHERE id=?`).bind(conversationId).first<{ user_id: string; account_id: string }>();
      if (!existing || existing.user_id !== user.id) return Response.json({ error: "对话不存在或不属于当前账号" }, { status: 404 });
      if (existing.account_id !== accountId) return Response.json({ error: "同一对话不能切换 Amazon Ads 账户，请新建对话" }, { status: 409 });
      const previous = await d1().prepare(`SELECT role,content FROM messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT 16`).bind(conversationId).all<HistoryRow>();
      history = (previous.results ?? []).reverse();
    }

    const prepared = await attachmentContent(user.id, attachmentIds, message.trim());
    const activeSkill = await activeSkillForUser(user.id, skillId);
    const contextualContent = withHistory(prepared.content, history);
    if (!conversationId) await d1().prepare(`INSERT INTO conversations(id,user_id,account_id,title,created_at,updated_at) VALUES(?,?,?,?,?,?)`).bind(convo, user.id, accountId ?? "pending", message.slice(0, 50), now, now).run();
    else await d1().prepare(`UPDATE conversations SET updated_at=? WHERE id=? AND user_id=?`).bind(now, convo, user.id).run();
    const statements = [d1().prepare(`INSERT INTO messages(id,conversation_id,role,content,created_at) VALUES(?,?,?,?,?)`).bind(userMessageId, convo, "user", message, now)];
    for (const row of prepared.rows) statements.push(d1().prepare(`UPDATE attachments SET conversation_id=?,message_id=? WHERE id=? AND user_id=?`).bind(convo, userMessageId, row.id, user.id));
    await d1().batch(statements);

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let assistant = "";
        try {
          controller.enqueue(sse("status", { stage: "analyzing", text: activeSkill ? `正在载入 Skill：${activeSkill.name}` : prepared.rows.length ? `正在读取 ${prepared.rows.length} 个附件并匹配 Amazon Ads 操作手册` : "正在匹配 Amazon Ads 操作手册与实时 MCP Schema" }));
          const plan = await planAgent(user.id, accountId, contextualContent, text => controller.enqueue(sse("status", { stage: "agent", text })), activeSkill, prepared.rows.length ? undefined : message.trim(), convo, agentVersion);
          if (plan.type === "approval") {
            controller.enqueue(sse("approval", { id: plan.id, summary: plan.summary, toolName: plan.toolName, args: plan.args, actionCount: "actionCount" in plan ? plan.actionCount : 1 }));
            assistant = plan.summary;
          } else {
            assistant = plan.content;
            emitAnswer(controller, assistant);
          }
          await d1().prepare(`INSERT INTO messages(id,conversation_id,role,content,created_at) VALUES(?,?,?,?,?)`).bind(crypto.randomUUID(), convo, "assistant", assistant || "已生成审批计划", Date.now()).run();
          controller.enqueue(sse("done", { conversationId: convo, modelRounds: plan.modelRounds }));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "执行失败";
          console.error("chat_execution_failed", { userId: user.id, accountId: accountId ?? null, conversationId: convo, error: errorMessage.slice(0, 1500) });
          try {
            await d1().prepare(`INSERT INTO audit_logs(id,user_id,account_id,action,target,detail,outcome,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), user.id, accountId ?? null, "chat.failed", convo, errorMessage.slice(0, 1500), "failure", Date.now()).run();
          } catch { /* Do not mask the original failure. */ }
          controller.enqueue(sse("error", { message: errorMessage }));
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "请求失败" }, { status: 400 });
  }
}
