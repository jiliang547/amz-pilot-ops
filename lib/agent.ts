import { d1 } from "./db";
import { accountCredentials } from "./accounts";
import { AmazonMcpClient, isWriteTool, preferredTools } from "./amazon-mcp";
import { decide, type AgentMessage, type ModelContent, type ToolCall } from "./model";
import { selectToolsForMessage } from "./tool-router";

function messageText(content: ModelContent): string {
  if (typeof content === "string") return content;
  return content.filter(item => item.type === "text").map(item => item.type === "text" ? item.text : "").join("\n");
}

function parseArgs(call: ToolCall): Record<string, unknown> {
  try { return JSON.parse(call.function.arguments || "{}"); }
  catch { throw new Error(`模型为 ${call.function.name} 生成的工具参数不是有效 JSON`); }
}

export async function planAgent(
  userId: string,
  accountId: string | undefined,
  message: ModelContent,
  onStatus?: (text: string) => void,
) {
  const { row, credentials } = await accountCredentials(userId, accountId);
  const schemaClient = new AmazonMcpClient(credentials, "FIXED");
  const live = await schemaClient.listTools();
  const allowed = live.filter(tool => preferredTools.includes(tool.name));
  const tools = selectToolsForMessage(messageText(message), allowed);
  const messages: AgentMessage[] = [{ role: "user", content: message }];

  for (let step = 0; step < 4; step++) {
    onStatus?.(step === 0 ? `正在规划操作（已按问题筛选 ${tools.length} 个 MCP 工具）` : `正在基于第 ${step} 轮真实查询结果继续分析`);
    const decision = await decide(userId, messages, tools);
    if (!decision.toolCalls.length) {
      const content = decision.content.trim();
      if (!content) throw new Error("模型没有返回回答或工具调用");
      return { type: "answer" as const, content, accountId: row.id, modelRounds: step + 1 };
    }

    const resolved = decision.toolCalls.map(call => {
      const tool = tools.find(candidate => candidate.name === call.function.name);
      if (!tool) throw new Error(`模型请求了未授权或与当前问题无关的工具：${call.function.name}`);
      return { call, tool, args: parseArgs(call) };
    });
    const writes = resolved.filter(item => isWriteTool(item.tool.name));
    if (writes.length) {
      if (resolved.length !== 1 || writes.length !== 1) throw new Error("为保证安全，每轮只能提交一个写操作；请先完成查询确认再修改");
      const write = writes[0];
      const id = crypto.randomUUID();
      const summary = decision.content.trim() || `准备执行 ${write.tool.name}。请核对目标账户、对象 ID 和参数后再批准。`;
      await d1().prepare(`INSERT INTO approvals(id,user_id,account_id,tool_name,tool_args,summary,status,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(id, userId, row.id, write.tool.name, JSON.stringify(write.args), summary, "pending", Date.now()).run();
      return { type: "approval" as const, id, summary, toolName: write.tool.name, args: write.args, accountId: row.id, modelRounds: step + 1 };
    }

    messages.push({ role: "assistant", content: decision.content || "", tool_calls: decision.toolCalls });
    onStatus?.(`正在调用 ${resolved.map(item => item.tool.name).join("、")}`);
    for (const item of resolved.slice(0, 3)) {
      const result = await new AmazonMcpClient(credentials).callTool(item.tool.name, item.args);
      await d1().prepare(`INSERT INTO audit_logs(id,user_id,account_id,action,target,detail,outcome,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), userId, row.id, "tool.read", item.tool.name, JSON.stringify(item.args).slice(0, 12000), "success", Date.now()).run();
      const resultText = JSON.stringify(result).slice(0, 24000);
      messages.push({ role: "tool", tool_call_id: item.call.id, name: item.tool.name, content: resultText });
    }
  }
  throw new Error("本次任务需要超过 4 轮 MCP 查询。请缩小查询范围，或指定 Campaign / Ad Group / Target ID 后重试");
}