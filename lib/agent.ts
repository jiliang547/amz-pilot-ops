import { d1 } from "./db";
import { accountCredentials } from "./accounts";
import { accountContextBlock, discoverAccountMetadata } from "./account-context";
import { AmazonMcpClient, isWriteTool, modeForTool, preferredTools } from "./amazon-mcp";
import { decide, type AgentMessage, type ModelContent, type ToolCall } from "./model";
import { executeReportTool } from "./report-jobs";
import type { ActiveSkill } from "./custom-skills";

// Custom Skills may explicitly request the MCP protocol's tools/list method.
// Expose it as a local read-only adapter so the model can inspect the already
// validated allowlisted schema without attempting an unauthorized remote call.
const schemaTool = {
  name: "tools/list",
  description: "Return the current allowlisted Amazon Ads MCP tools and schemas.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
} satisfies import("./amazon-mcp").McpTool;
function tryLocalConversation(message?: string) {
  if (!message) return undefined;
  const normalized = message.trim().replace(/[!！?？。.，,\s]+$/g, "").toLowerCase();
  if (!normalized) return undefined;
  if (/^(你好|您好|嗨|hi|hello|hey|在吗|有人吗)$/.test(normalized)) {
    return "你好，我是 AMZ Pilot。你可以直接告诉我需要查询或调整的 Amazon Ads 内容，例如“查询今天的广告花费总额”。";
  }
  if (/^(谢谢|感谢|多谢|thanks|thank you|好的|好|ok|okay|收到|明白了)$/.test(normalized)) {
    return "不客气。需要继续查询、分析或调整 Amazon Ads 时，直接告诉我即可。";
  }
  if (/^(你是谁|你能做什么|有什么功能|怎么用|帮助|help)$/.test(normalized)) {
    return "我是 AMZ Pilot，可以查询 Amazon Ads 账户、广告活动、广告组、广告、关键词与报表，也可以在你确认后执行调整。标准花费、销售额、点击量等汇总查询会直接由后端完成，不消耗模型 Token。";
  }
  return undefined;
}

function asksForKnownAccount(content: string): boolean {
  return /(请|需要|告诉|提供|选择|确认).{0,24}(account\s*id|accountid|marketplace|profile\s*id|账户|账号|店铺|站点)/i.test(content);
}

function selectedAccountClarification(row: Record<string, unknown>): string {
  const name = String(row.name ?? "当前店铺");
  const marketplace = String(row.marketplace ?? "").toUpperCase();
  const profileId = String(row.profile_id ?? "");
  const details = [marketplace && `${marketplace} 站点`, profileId && `Profile ${profileId}`].filter(Boolean).join("，");
  return `当前已使用你在页面选择的店铺「${name}」${details ? `（${details}）` : ""}，无需再提供 accountId 或 marketplace。请告诉我还缺少的查询对象、指标或日期范围。`;
}

function parseArgs(call: ToolCall): Record<string, unknown> {
  try { return JSON.parse(call.function.arguments || "{}"); }
  catch { throw new Error(`模型为 ${call.function.name} 生成的工具参数不是有效 JSON`); }
}

function stableKey(name: string, args: Record<string, unknown>): string {
  return `${name}:${JSON.stringify(args)}`;
}

function compactReportForModel(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const report = value as Record<string, unknown>;
  const downloadedReports = Array.isArray(report.downloadedReports)
    ? report.downloadedReports.map(item => {
        if (!item || typeof item !== "object") return item;
        const row = item as Record<string, unknown>;
        return { part: row.part, filename: row.filename, size: row.size, rowCount: row.rowCount, columns: row.columns, aggregates: row.aggregates };
      })
    : undefined;
  return {
    reportId: report.reportId,
    status: report.status,
    reusedSavedReport: report.reusedSavedReport,
    downloadedReports,
    note: "完整 CSV 已由后端保存和汇总；模型只接收列名与 aggregates，不接收 CSV 正文或签名 URL。",
  };
}

async function callReadTool(client: AmazonMcpClient, name: string, args: Record<string, unknown>, userId: string, accountId: string, onStatus?: (text: string) => void): Promise<unknown> {
  if (name === "reporting-create_campaign_report" || name === "reporting-create_report" || name === "reporting-retrieve_report") {
    return executeReportTool(client, name, args, { userId, accountId, onStatus });
  }
  return client.callTool(name, args);
}

export async function planAgent(
  userId: string,
  accountId: string | undefined,
  message: ModelContent,
  onStatus?: (text: string) => void,
  skill?: ActiveSkill,
  plainMessage?: string,
) {
  if (!skill) {
    const localAnswer = tryLocalConversation(plainMessage);
    if (localAnswer) {
      onStatus?.("已由后端直接回答，未调用大模型或 Amazon MCP");
      return { type: "answer" as const, content: localAnswer, accountId: accountId ?? "local", modelRounds: 0, localPath: true };
    }
  }

  const { row, credentials } = await accountCredentials(userId, accountId);
  const fixedClient = new AmazonMcpClient(credentials, "FIXED");
  const dynamicClient = new AmazonMcpClient(credentials, "DYNAMIC");
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
    credentials.advertiserAccountId = String(row.advertiser_account_id ?? credentials.advertiserAccountId ?? "") || undefined;
    await d1().prepare(`UPDATE accounts SET name=?,advertiser_account_id=?,marketplace=?,timezone=?,currency=?,updated_at=? WHERE id=? AND user_id=?`).bind(row.name, row.advertiser_account_id ?? null, row.marketplace ?? null, row.timezone ?? null, row.currency ?? null, Date.now(), row.id, userId).run();
  } catch { /* Saved account context is still usable. */ }

  const live = await fixedClient.listTools();
  const tools = [schemaTool, ...live.filter(tool => preferredTools.includes(tool.name))];
  const messages: AgentMessage[] = [{ role: "user", content: message }];
  const resultCache = new Map<string, unknown>();
  const repeatCounts = new Map<string, number>();
  let round = 0;

  while (true) {
    if (round >= 20) throw new Error("MCP Agent exceeded the maximum of 20 reasoning rounds");
    round++;
    onStatus?.(round === 1
      ? `正在按实操规则分析，并提供 ${tools.length} 个实时 MCP 工具`
      : `正在基于第 ${round - 1} 轮真实查询结果继续分析`);
    const decision = await decide(userId, messages, tools, skill, accountContextBlock(row));
    if (!decision.toolCalls.length) {
      let content = decision.content.trim();
      if (!content) throw new Error("模型没有返回回答或工具调用");
      if (asksForKnownAccount(content)) content = selectedAccountClarification(row);
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
      const key = stableKey(item.tool.name, item.args);
      const repeatCount = (repeatCounts.get(key) ?? 0) + 1;
      repeatCounts.set(key, repeatCount);
      if (repeatCount > 3) {
        messages.push({ role: "tool", tool_call_id: item.call.id, name: item.tool.name, content: JSON.stringify({
          error: "This exact MCP call has already been attempted three times in this Agent run.",
          instruction: "Use the existing result, change arguments according to the live schema, or ask for one genuinely missing business value.",
        }) });
        continue;
      }
      const cached = resultCache.get(key);
      onStatus?.(cached === undefined ? `正在调用 ${item.tool.name}` : `正在复用本轮已取得的 ${item.tool.name} 结果`);
      let rawResult: unknown;
      try {
        rawResult = cached === undefined
          ? item.tool.name === schemaTool.name
            ? { tools: tools.filter(tool => tool.name !== schemaTool.name) }
            : await callReadTool(clients[modeForTool(item.tool.name)], item.tool.name, item.args, userId, row.id, onStatus)
          : cached;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        messages.push({ role: "tool", tool_call_id: item.call.id, name: item.tool.name, content: JSON.stringify({
          error: message,
          instruction: "The MCP call failed. Re-read the live tool schema, correct only unsupported or missing arguments, and continue the same business request. Do not require an object API ID for an account-level report question.",
        }) });
        onStatus?.(`MCP ${item.tool.name} 调用失败，Agent 正在根据实时 Schema 自动修正参数`);
        continue;
      }
      if (cached === undefined) resultCache.set(key, rawResult);
      await d1().prepare(`INSERT INTO audit_logs(id,user_id,account_id,action,target,detail,outcome,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), userId, row.id, "tool.read", item.tool.name, JSON.stringify(item.args).slice(0, 12000), "success", Date.now()).run();
      const result = item.tool.name.startsWith("reporting-") ? compactReportForModel(rawResult) : rawResult;
      const serialized = JSON.stringify(result) || "null";
      messages.push({ role: "tool", tool_call_id: item.call.id, name: item.tool.name, content: serialized.length > 450_000 ? `${serialized.slice(0, 450_000)}\n[工具结果已在 450000 字符处截断；请使用汇总字段回答]` : serialized });
    }
  }
}
