import { d1 } from "./db";
import { accountCredentials } from "./accounts";
import { AmazonMcpClient, isWriteTool, modeForTool, preferredTools } from "./amazon-mcp";
import { decide, type AgentMessage, type ModelContent, type ToolCall } from "./model";
import { enrichReportResult, reportIsPending } from "./report-result";
import type { ActiveSkill } from "./custom-skills";

function parseArgs(call: ToolCall): Record<string, unknown> {
  try { return JSON.parse(call.function.arguments || "{}"); }
  catch { throw new Error(`模型为 ${call.function.name} 生成的工具参数不是有效 JSON`); }
}

function stableKey(name: string, args: Record<string, unknown>): string {
  return `${name}:${JSON.stringify(args)}`;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function callReadTool(
  client: AmazonMcpClient,
  name: string,
  args: Record<string, unknown>,
  onStatus?: (text: string) => void,
): Promise<unknown> {
  let result = await client.callTool(name, args);
  if (name === "reporting-retrieve_report") {
    let poll = 0;
    while (reportIsPending(result)) {
      poll++;
      onStatus?.(`Amazon 报表仍在生成，正在轮询同一个 Report ID（第 ${poll} 次）`);
      await sleep(Math.min(10_000, 2_000 + poll * 1_000));
      result = await client.callTool(name, args);
    }
    result = await enrichReportResult(result, onStatus);
  }
  return result;
}

export async function planAgent(
  userId: string,
  accountId: string | undefined,
  message: ModelContent,
  onStatus?: (text: string) => void,
  skill?: ActiveSkill,
) {
  const { row, credentials } = await accountCredentials(userId, accountId);
  const fixedClient = new AmazonMcpClient(credentials, "FIXED");
  const dynamicClient = new AmazonMcpClient(credentials, "DYNAMIC");
  const live = await fixedClient.listTools();
  const tools = live.filter(tool => preferredTools.includes(tool.name));
  const clients = { FIXED: fixedClient, DYNAMIC: dynamicClient };
  const messages: AgentMessage[] = [{ role: "user", content: message }];
  const resultCache = new Map<string, unknown>();
  let round = 0;

  while (true) {
    round++;
    onStatus?.(round === 1
      ? `正在按操作手册分析，并提供全部 ${tools.length} 个已验证 MCP 工具及实时 Schema`
      : `正在基于第 ${round - 1} 轮真实查询结果继续分析`);
    const decision = await decide(userId, messages, tools, skill);
    if (!decision.toolCalls.length) {
      const content = decision.content.trim();
      if (!content) throw new Error("模型没有返回回答或工具调用");
      return { type: "answer" as const, content, accountId: row.id, modelRounds: round };
    }

    const resolved = decision.toolCalls.map(call => {
      const tool = tools.find(candidate => candidate.name === call.function.name);
      if (!tool) throw new Error(`模型请求了未授权或未经手册验证的工具：${call.function.name}`);
      return { call, tool, args: parseArgs(call) };
    });
    const writes = resolved.filter(item => isWriteTool(item.tool.name));
    if (writes.length) {
      if (resolved.length !== 1 || writes.length !== 1) throw new Error("为保证安全，每轮只能提交一个写操作；请先完成查询确认再修改");
      const write = writes[0];
      const id = crypto.randomUUID();
      const summary = decision.content.trim() || `准备执行 ${write.tool.name}。请核对目标账户、对象 ID 和参数后再批准。`;
      await d1().prepare(`INSERT INTO approvals(id,user_id,account_id,tool_name,tool_args,summary,status,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(id, userId, row.id, write.tool.name, JSON.stringify(write.args), summary, "pending", Date.now()).run();
      return { type: "approval" as const, id, summary, toolName: write.tool.name, args: write.args, accountId: row.id, modelRounds: round };
    }

    messages.push({ role: "assistant", content: decision.content || "", tool_calls: decision.toolCalls });
    for (const item of resolved) {
      const key = stableKey(item.tool.name, item.args);
      const cached = resultCache.get(key);
      onStatus?.(cached === undefined ? `正在调用 ${item.tool.name}` : `正在复用本轮已取得的 ${item.tool.name} 结果`);
      const result = cached === undefined
        ? await callReadTool(clients[modeForTool(item.tool.name)], item.tool.name, item.args, onStatus)
        : cached;
      if (cached === undefined) resultCache.set(key, result);
      await d1().prepare(`INSERT INTO audit_logs(id,user_id,account_id,action,target,detail,outcome,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), userId, row.id, "tool.read", item.tool.name, JSON.stringify(item.args).slice(0, 12000), "success", Date.now()).run();
      const serialized = JSON.stringify(result) || "null";
      const resultText = serialized.length > 450_000
        ? `${serialized.slice(0, 450_000)}\n[工具结果过大，已在 450000 字符处截断；请使用汇总字段回答]`
        : serialized;
      messages.push({ role: "tool", tool_call_id: item.call.id, name: item.tool.name, content: resultText });
    }
  }
}