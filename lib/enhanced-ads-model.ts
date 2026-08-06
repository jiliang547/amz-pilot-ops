import type { McpTool } from "./amazon-mcp";
import { modelConfigForUser, modelEndpoint, modelHeaders } from "./model-config";
import { recordTokenUsage, type ProviderUsage } from "./token-usage";

export type EnhancedToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type EnhancedMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: EnhancedToolCall[];
};

export type EnhancedModelReply = {
  content: string;
  toolCalls: EnhancedToolCall[];
};

const SYSTEM = `你是“增强型智能广告”，一个独立的 Amazon Ads 运营 Agent。
你的工作方式遵循 Amazon Ads 官方 Agent 工作坊：先理解用户目标，再从运行时 tools/list 返回的实时 MCP 工具中选择工具，执行后读取结果，必要时继续调用，最后交付基于真实数据的结论。

规则：
1. 查询类问题必须先调用工具获取真实数据，不能凭记忆、预算或名称猜测结果。
2. 已选择的账户上下文是权威默认值，不要再次要求用户提供 accountId、Profile ID、marketplace 或站点。
3. 工具参数必须严格遵循本轮提供的 inputSchema。不要加入 schema 没有的字段；尤其不能擅自加入 query.fields。
4. 报表是异步的。创建后若返回 PENDING，继续用同一个 reportId 调用 reporting-retrieve_report，不能重复创建。
5. 服务端会下载并分析完整 CSV。downloadedReports、groups、dimensions 和 deterministicAnalysis 都来自完整文件，不是截断预览；必须基于这些字段回答。
6. “表现最差”默认按运营风险判断：优先指出有花费但零销售的活动；如果用户明确询问 ACOS，同时给出有销售活动中最高的有限 ACOS，并清楚说明零销售时 ACOS 不可计算。
7. 工具失败时读取错误并依据实时 schema 修正参数继续尝试，不能第一次失败就结束。
8. 创建、修改、暂停、启用、删除等写操作会由系统暂停等待人工确认。不要绕过确认。
9. 回答要给出日期范围、账户时区、对象名称、真实 API ID、关键指标和判断口径。没有数据就明确说报表为空，不要换日期。
10. 不要声称自己无法处理 CSV，也不要要求用户在本地处理；服务器执行层会完成完整文件处理。
`;

function toolDefinitions(tools: McpTool[]) {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: (tool.description ?? "").slice(0, 900),
      parameters: tool.inputSchema,
    },
  }));
}

type ProviderResponse = {
  choices?: Array<{ message?: { content?: string | null; tool_calls?: EnhancedToolCall[] } }>;
  usage?: ProviderUsage;
};

export async function decideEnhancedAds(input: {
  userId: string;
  messages: EnhancedMessage[];
  tools: McpTool[];
  accountContext: string;
  round: number;
}): Promise<EnhancedModelReply> {
  const config = await modelConfigForUser(input.userId);
  const requestBody = {
    model: config.modelName,
    messages: [
      {
        role: "system",
        content: `${SYSTEM}\n当前服务器 UTC 日期：${new Date().toISOString().slice(0, 10)}。\n${input.accountContext}`,
      },
      ...input.messages,
    ],
    tools: toolDefinitions(input.tools),
    tool_choice: "auto",
    stream: false,
    temperature: 0.1,
  };
  console.info("enhanced_ads_model_request", {
    round: input.round,
    model: config.modelName,
    tools: input.tools.length,
    toolSchemaChars: JSON.stringify(requestBody.tools).length,
    messageChars: JSON.stringify(input.messages).length,
  });
  const response = await fetch(modelEndpoint(config), {
    method: "POST",
    headers: modelHeaders(config),
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`模型接口失败 (${response.status}): ${(await response.text()).slice(0, 300)}`);
  const data = await response.json() as ProviderResponse;
  const message = data.choices?.[0]?.message;
  if (!message) throw new Error("模型没有返回消息");
  const reply = { content: message.content ?? "", toolCalls: message.tool_calls ?? [] };
  await recordTokenUsage({
    userId: input.userId,
    modelName: config.modelName,
    modelSource: config.source,
    operation: "enhanced-ads.react",
    usage: data.usage,
    request: requestBody,
    response: reply,
  });
  return reply;
}
