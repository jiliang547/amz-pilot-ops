import { d1 } from "./db";
import { accountCredentials } from "./accounts";
import { accountContextBlock, discoverAccountMetadata } from "./account-context";
import { AmazonMcpClient, isWriteTool, modeForTool, preferredTools } from "./amazon-mcp";
import { decide, type AgentMessage, type ModelContent, type ToolCall } from "./model";
import { executeReportTool } from "./report-jobs";
import type { ActiveSkill } from "./custom-skills";

function parseArgs(call: ToolCall): Record<string, unknown> { try { return JSON.parse(call.function.arguments || "{}"); } catch { throw new Error(`模型为 ${call.function.name} 生成的工具参数不是有效 JSON`); } }
function stableKey(name: string, args: Record<string, unknown>): string { return `${name}:${JSON.stringify(args)}`; }

async function callReadTool(client: AmazonMcpClient, name: string, args: Record<string, unknown>, userId: string, accountId: string, onStatus?: (text: string) => void): Promise<unknown> {
  if (name === "reporting-create_campaign_report" || name === "reporting-create_report" || name === "reporting-retrieve_report") {
    return executeReportTool(client, name, args, { userId, accountId, onStatus });
  }
  return client.callTool(name, args);
}

export async function planAgent(userId: string, accountId: string | undefined, message: ModelContent, onStatus?: (text: string) => void, skill?: ActiveSkill) {
  const { row, credentials } = await accountCredentials(userId, accountId);
  const fixedClient = new AmazonMcpClient(credentials, "FIXED");
  const dynamicClient = new AmazonMcpClient(credentials, "DYNAMIC");
  const live = await fixedClient.listTools();
  const tools = live.filter(tool => preferredTools.includes(tool.name));
  const clients = { FIXED: fixedClient, DYNAMIC: dynamicClient };

  onStatus?.("正在核对当前 Profile 对应的站点、时区与币种");
  try {
    const accountResult = await fixedClient.callTool("ads_accounts-list_ads_accounts", { body: { maxResults: 100 } });
    const metadata = discoverAccountMetadata(accountResult, credentials.profileId);
    row.advertiser_account_id = metadata.advertiserAccountId ?? row.advertiser_account_id;
    row.marketplace = metadata.marketplace ?? row.marketplace;
    row.timezone = metadata.timezone ?? row.timezone;
    row.currency = metadata.currency ?? row.currency;
    row.name = metadata.name ?? row.name;
    await d1().prepare(`UPDATE accounts SET name=?,advertiser_account_id=?,marketplace=?,timezone=?,currency=?,updated_at=? WHERE id=? AND user_id=?`).bind(row.name, row.advertiser_account_id ?? null, row.marketplace ?? null, row.timezone ?? null, row.currency ?? null, Date.now(), row.id, userId).run();
  } catch { /* Saved account context is still usable. */ }

  const messages: AgentMessage[] = [{ role: "user", content: message }];
  const resultCache = new Map<string, unknown>();
  let round = 0;
  while (true) {
    round++;
    onStatus?.(round === 1 ? `正在按实操规则分析，并提供 ${tools.length} 个实时 MCP 工具` : `正在基于第 ${round - 1} 轮真实查询结果继续分析`);
    const decision = await decide(userId, messages, tools, skill, accountContextBlock(row));
    if (!decision.toolCalls.length) {
      const content = decision.content.trim();
      if (!content) throw new Error("模型没有返回回答或工具调用");
      return { type: "answer" as const, content, accountId: row.id, modelRounds: round };
    }
    const resolved = decision.toolCalls.map(call => {
      const tool = tools.find(candidate => candidate.name === call.function.name);
      if (!tool) throw new Error(`模型请求了未授权的工具：${call.function.name}`);
      return { call, tool, args: parseArgs(call) };
    });
    const writes = resolved.filter(item => isWriteTool(item.tool.name));
    if (writes.length) {
      if (resolved.length !== 1 || writes.length !== 1) throw new Error("为保证安全，每轮只能提交一个写操作；请先完成查询确认再修改");
      const write = writes[0], id = crypto.randomUUID();
      const summary = decision.content.trim() || `准备执行 ${write.tool.name}。请核对目标账户、对象 ID 和参数后再批准。`;
      await d1().prepare(`INSERT INTO approvals(id,user_id,account_id,tool_name,tool_args,summary,status,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(id, userId, row.id, write.tool.name, JSON.stringify(write.args), summary, "pending", Date.now()).run();
      return { type: "approval" as const, id, summary, toolName: write.tool.name, args: write.args, accountId: row.id, modelRounds: round };
    }
    messages.push({ role: "assistant", content: decision.content || "", tool_calls: decision.toolCalls });
    for (const item of resolved) {
      const key = stableKey(item.tool.name, item.args), cached = resultCache.get(key);
      onStatus?.(cached === undefined ? `正在调用 ${item.tool.name}` : `正在复用本轮已取得的 ${item.tool.name} 结果`);
      const result = cached === undefined ? await callReadTool(clients[modeForTool(item.tool.name)], item.tool.name, item.args, userId, row.id, onStatus) : cached;
      if (cached === undefined) resultCache.set(key, result);
      await d1().prepare(`INSERT INTO audit_logs(id,user_id,account_id,action,target,detail,outcome,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), userId, row.id, "tool.read", item.tool.name, JSON.stringify(item.args).slice(0, 12000), "success", Date.now()).run();
      const serialized = JSON.stringify(result) || "null";
      messages.push({ role: "tool", tool_call_id: item.call.id, name: item.tool.name, content: serialized.length > 450_000 ? `${serialized.slice(0, 450_000)}\n[工具结果已在 450000 字符处截断；请使用汇总字段回答]` : serialized });
    }
  }
}
