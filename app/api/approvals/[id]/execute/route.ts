import { assertSameOrigin, requireUser } from "@/lib/auth";
import { accountCredentials } from "@/lib/accounts";
import { d1 } from "@/lib/db";
import { AmazonMcpClient, isWriteTool } from "@/lib/amazon-mcp";
import { expandWorkflowActions, type WorkflowAction } from "@/lib/ads-workflow";
import { preflightWrite, verifyWrite } from "@/lib/write-verification";
import { mcpResultError } from "@/lib/ads-agent-v2";
import { normalizeAmazonToolArguments } from "@/lib/tool-schema";

type ApprovalRow = { id: string; account_id: string; tool_name: string; tool_args: string; status: string };
type ActionResult = { toolName: string; args: Record<string, unknown>; preflight: unknown; writeResult?: unknown; verification?: unknown; status: "executed" | "partial" | "failed"; error?: string };

function approvalActions(row: ApprovalRow): WorkflowAction[] {
  const parsed = JSON.parse(row.tool_args) as Record<string, unknown>;
  const actions = parsed.version === 1 && Array.isArray(parsed.actions)
    ? parsed.actions as WorkflowAction[]
    : [{ toolName: row.tool_name, args: parsed }];
  return expandWorkflowActions(actions);
}

function hasPartialSuccess(value: unknown): boolean {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) { try { return hasPartialSuccess(JSON.parse(trimmed)); } catch { return /partialSuccess/i.test(value); } }
    return /partialSuccess/i.test(value);
  }
  if (Array.isArray(value)) return value.some(hasPartialSuccess);
  if (!value || typeof value !== "object") return false;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key.toLowerCase() === "partialsuccess") return Array.isArray(item) ? item.length > 0 : Boolean(item);
    if (hasPartialSuccess(item)) return true;
  }
  return false;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    if (user.mustChangePassword) return Response.json({ error: "请先修改初始密码" }, { status: 428 });
    const { id } = await context.params;
    const row = await d1().prepare(`SELECT id,account_id,tool_name,tool_args,status FROM approvals WHERE id=? AND user_id=?`).bind(id, user.id).first<ApprovalRow>();
    if (!row) return Response.json({ error: "审批不存在" }, { status: 404 });
    if (row.status !== "pending") return Response.json({ error: "该审批已处理" }, { status: 409 });
    const actions = approvalActions(row);
    if (!actions.length || actions.some(action => !isWriteTool(action.toolName))) return Response.json({ error: "审批中包含未授权的工具类型" }, { status: 400 });
    const claimed = await d1().prepare(`UPDATE approvals SET status='executing' WHERE id=? AND status='pending'`).bind(id).run();
    if (!claimed.meta.changes) return Response.json({ error: "审批正在被处理" }, { status: 409 });

    const results: ActionResult[] = [];
    try {
      const { credentials } = await accountCredentials(user.id, row.account_id);
      const live = await new AmazonMcpClient(credentials, "FIXED").listTools();
      const liveNames = new Set(live.map(tool => tool.name));
      for (const action of actions) if (!liveNames.has(action.toolName)) throw new Error(`目标工具已不在实时 MCP Schema 中：${action.toolName}`);
      for (const action of actions) {
        const schema = live.find(tool => tool.name === action.toolName)?.inputSchema;
        if (schema) action.args = normalizeAmazonToolArguments(action.toolName, action.args, schema);
      }

      let partial = false;
      for (let index = 0; index < actions.length; index++) {
        const action = actions[index];
        let preflight: unknown = null;
        try {
          preflight = /(?:^|[-_])create(?:_|$)/i.test(action.toolName) ? null : await preflightWrite(credentials, action.toolName, action.args);
          const writeResult = await new AmazonMcpClient(credentials).callTool(action.toolName, action.args);
          const writeError = mcpResultError(writeResult);
          if (writeError) throw new Error(`Amazon 写入工具返回错误：${writeError}`);
          partial = hasPartialSuccess(writeResult);
          let verificationResult = writeResult;
          if (!partial && action.toolName === "campaign_management-create_campaign" && !/campaignId/i.test(JSON.stringify(writeResult))) {
            const campaign = ((action.args.body as Record<string, unknown> | undefined)?.campaigns as Array<Record<string, unknown>> | undefined)?.[0];
            const name = typeof campaign?.name === "string" ? campaign.name.trim() : "";
            if (name) {
              const readBack = await new AmazonMcpClient(credentials, "DYNAMIC").callTool("campaign_management-query_campaign", { body: { adProductFilter: { include: ["SPONSORED_PRODUCTS"] }, maxResults: 100, nameFilter: { include: [name], queryTermMatchType: "EXACT_MATCH" } } });
              const recoveredId = JSON.stringify(readBack).match(/(?:campaignId|campaign_id)\"?\s*[:=]\s*\"?(\d{8,20})/i)?.[1];
              if (recoveredId) verificationResult = { writeResult, campaignId: recoveredId, nameReadBack: readBack };
            }
          }
          const verification = partial ? null : await verifyWrite(credentials, action.toolName, action.args, verificationResult);
          results.push({ toolName: action.toolName, args: action.args, preflight, writeResult, verification, status: partial ? "partial" : "executed" });
          await d1().prepare(`INSERT INTO audit_logs(id,user_id,account_id,action,target,detail,outcome,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), user.id, row.account_id, "tool.write", action.toolName, JSON.stringify({ index: index + 1, total: actions.length, args: action.args }).slice(0, 12000), partial ? "partial" : "success", Date.now()).run();
          if (partial) break;
        } catch (error) {
          const message = error instanceof Error ? error.message : "执行失败";
          results.push({ toolName: action.toolName, args: action.args, preflight, status: "failed", error: message });
          throw error;
        }
      }
      const status = partial ? "partial" : "executed";
      await d1().prepare(`UPDATE approvals SET status=?,result=?,executed_at=? WHERE id=?`).bind(status, JSON.stringify({ results }).slice(0, 500000), Date.now(), id).run();
      return Response.json({ ok: true, partial, executedCount: results.length, totalCount: actions.length, results });
    } catch (error) {
      await d1().prepare(`UPDATE approvals SET status='failed',result=?,executed_at=? WHERE id=?`).bind(JSON.stringify({ error: error instanceof Error ? error.message : "failed", results }).slice(0, 500000), Date.now(), id).run();
      throw error;
    }
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "执行失败" }, { status: 400 });
  }
}
