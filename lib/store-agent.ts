import { d1 } from "./db";
import { modelConfigForUser, modelEndpoint, modelHeaders } from "./model-config";
import { recordTokenUsage, type ProviderUsage } from "./token-usage";
import { endpointById, executeSpApiEndpoint, exploreSpApiCatalog, loadSpApiConnection, SpApiClient } from "./sp-api";
import { getReplenishmentSnapshot } from "./store-replenishment";
import { getFinancialSummary } from "./store-finance";

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type AgentMessage = { role: "user" | "assistant" | "tool"; content: string; tool_call_id?: string; name?: string; tool_calls?: ToolCall[] };
type Tool = { name: string; description: string; inputSchema: Record<string, unknown> };

const SYSTEM = `你是 AMZ Pilot 的亚马逊店铺运营 Agent。用户会用自然语言询问库存、订单、Listing、财务、物流等店铺问题。你必须先理解意图，再使用 SP-API MCP 兼容工具取得真实结果，最后用中文交付结论；不要只给用户操作教程。
规则：
1. 不知道 Endpoint ID 时先调用 sp_api_explore_catalog，不得编造端点。
2. sp_api_execute 的 parameters 中，路径参数直接按名称提供；查询参数放 query；POST/PUT/PATCH 请求体只放 body。不得使用未定义的 fields 捷径。
3. 工具报错后阅读错误、修正参数并继续；最多 20 轮，不得第一次失败就放弃。
4. 用户询问库存、7/30 天销量或补货建议时，优先调用 store_inventory_replenishment。补货公式由服务端确定，不要自行估算。
5. 用户询问结算、结算利润、到账或财务金额时，优先调用 store_financial_summary，使用 Finances API 查询交易净额；不要调用 reports_createReport，也不要使用数字 reportType（例如 1117）。若用户明确要求结算报表，reportType 只能使用 Amazon 文档中的字符串，例如 GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2。
6. store_financial_summary 返回的是 Amazon 结算净额，不等同于扣除采购成本、广告成本后的会计利润；交付时要明确说明口径。
7. GET/DELETE 以外的变更操作必须生成审批，审批前不得声称已经执行。
8. 不得输出或索取已保存密钥。结果过大时先总结并列出最关键条目。`;

const TOOLS: Tool[] = [
  {
    name: "sp_api_explore_catalog",
    description: "搜索 342 个 Amazon SP-API 端点。返回真实 Endpoint ID、HTTP 方法和路径。",
    inputSchema: { type: "object", properties: { query: { type: "string" }, category: { type: "string" }, method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] }, limit: { type: "integer", minimum: 1, maximum: 50 } }, additionalProperties: false },
  },
  {
    name: "sp_api_execute",
    description: "执行一个已检索到的 SP-API Endpoint。路径参数直接放 parameters；查询参数放 parameters.query；请求体放 parameters.body。写操作会先创建人工审批。",
    inputSchema: { type: "object", properties: { endpoint: { type: "string" }, parameters: { type: "object", additionalProperties: true } }, required: ["endpoint"], additionalProperties: false },
  },
  {
    name: "store_inventory_replenishment",
    description: "读取 FBA 当前可售库存和近 30 天订单，按 SKU 返回 7 天销量、30 天销量、日销量、150 天目标库存与建议补货量。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "store_financial_summary",
    description: "查询指定日期范围的 Amazon 结算/财务净额。用户询问结算、利润、到账、财务金额时优先使用；不要创建 Reports API 报表。日期使用 YYYY-MM-DD，结束日期不包含在统计范围内。",
    inputSchema: { type: "object", properties: { startDate: { type: "string", description: "包含，YYYY-MM-DD" }, endDate: { type: "string", description: "不包含，YYYY-MM-DD" }, transactionStatus: { type: "string", enum: ["RELEASED", "DEFERRED_RELEASED"] } }, required: ["startDate", "endDate"], additionalProperties: false },
  },
];

function toolDefs() {
  return TOOLS.map(tool => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } }));
}

function parseJson(value: string) {
  try { return JSON.parse(value || "{}"); } catch { throw new Error("模型生成了无效的工具参数 JSON"); }
}

async function modelReply(userId: string, messages: AgentMessage[]) {
  const config = await modelConfigForUser(userId);
  const requestBody = { model: config.modelName, messages: [{ role: "system", content: `${SYSTEM}\n当前 UTC 时间：${new Date().toISOString()}` }, ...messages], tools: toolDefs(), tool_choice: "auto", stream: false, temperature: 0.1 };
  const response = await fetch(modelEndpoint(config), { method: "POST", headers: modelHeaders(config), body: JSON.stringify(requestBody) });
  if (!response.ok) throw new Error(`模型接口失败 (${response.status}): ${(await response.text()).slice(0, 300)}`);
  const data = await response.json() as { choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }>; usage?: ProviderUsage };
  const message = data.choices?.[0]?.message;
  if (!message) throw new Error("模型未返回结果");
  const reply = { content: message.content ?? "", toolCalls: message.tool_calls ?? [] };
  await recordTokenUsage({ userId, modelName: config.modelName, modelSource: config.source, operation: "store.agent", usage: data.usage, request: requestBody, response: reply });
  return reply;
}

async function createApproval(userId: string, endpoint: string, parameters: Record<string, unknown>) {
  const definition = endpointById(endpoint);
  const id = crypto.randomUUID();
  const summary = `待确认：${definition.method} ${definition.name} (${definition.path})`;
  await d1().prepare(`INSERT INTO approvals(id,user_id,account_id,tool_name,tool_args,summary,status,created_at) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(id, userId, `spapi:${userId}`, "sp_api_execute", JSON.stringify({ endpoint, parameters }), summary, "pending", Date.now()).run();
  return { id, summary, toolName: "sp_api_execute", args: { endpoint, parameters }, actionCount: 1 };
}

export async function runStoreAgent(userId: string, prompt: string, status: (text: string) => void = () => {}) {
  const connection = await loadSpApiConnection(userId);
  const client = new SpApiClient(connection);
  const messages: AgentMessage[] = [{ role: "user", content: prompt }];
  const seen = new Map<string, number>();
  for (let round = 1; round <= 20; round++) {
    status(`店铺 Agent 第 ${round}/20 轮：正在思考并选择 SP-API 工具`);
    const decision = await modelReply(userId, messages);
    if (!decision.toolCalls.length) return { type: "answer" as const, content: decision.content || "任务已完成。", modelRounds: round };
    messages.push({ role: "assistant", content: decision.content, tool_calls: decision.toolCalls });
    for (const call of decision.toolCalls) {
      const args = parseJson(call.function.arguments);
      const signature = `${call.function.name}:${JSON.stringify(args)}`;
      const count = (seen.get(signature) ?? 0) + 1;
      seen.set(signature, count);
      if (count >= 3) throw new Error(`店铺 Agent 连续重复同一工具调用 3 次：${call.function.name}`);
      status(`正在调用 ${call.function.name}`);
      let result: unknown;
      try {
        if (call.function.name === "sp_api_explore_catalog") result = exploreSpApiCatalog(args);
        else if (call.function.name === "store_inventory_replenishment") result = await getReplenishmentSnapshot(userId, status);
        else if (call.function.name === "store_financial_summary") result = await getFinancialSummary(connection, {
          startDate: String(args.startDate ?? ""),
          endDate: String(args.endDate ?? ""),
          transactionStatus: args.transactionStatus,
        });
        else if (call.function.name === "sp_api_execute") {
          const endpoint = endpointById(String(args.endpoint ?? ""));
          if (endpoint.id === "reports_createReport" && typeof args.parameters?.body?.reportType !== "string") {
            result = { isError: true, error: "reports_createReport 的 reportType 必须是 Amazon 定义的字符串，不能使用数字 1117 等内部编号。查询结算/利润请改用 store_financial_summary；如确需结算报表，请使用 GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2。", instruction: "不要创建这个报表请求，请调用 store_financial_summary 并传入目标日期范围。" };
          } else if (endpoint.method !== "GET") {
            const approval = await createApproval(userId, endpoint.id, args.parameters ?? {});
            return { type: "approval" as const, ...approval, modelRounds: round };
          } else {
            result = await executeSpApiEndpoint(client, endpoint.id, args.parameters ?? {});
          }
        } else throw new Error(`未知工具：${call.function.name}`);
      } catch (error) {
        result = { isError: true, error: error instanceof Error ? error.message : String(error), instruction: "请修正 Endpoint ID 或参数后继续尝试，不要直接放弃。" };
      }
      const serialized = JSON.stringify(result);
      messages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: serialized.length > 120_000 ? serialized.slice(0, 120_000) + "\n[结果已截断，请总结现有结果]" : serialized });
    }
  }
  throw new Error("店铺 MCP Agent exceeded the maximum of 20 reasoning rounds");
}
