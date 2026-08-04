import { accountContextBlock } from "./account-context";
import type { AmazonCredentials, McpTool } from "./amazon-mcp";
import { AmazonMcpClient, isWriteTool, modeForTool } from "./amazon-mcp";
import { d1 } from "./db";
import { executeReportTool } from "./report-jobs";
import {
  modelConfigForUser,
  modelEndpoint,
  modelHeaders,
} from "./model-config";
import { recordTokenUsage, type ProviderUsage } from "./token-usage";

type CompiledSkillBase = {
  accountId: string;
  modelRounds: 0 | 1;
  compiledSkill: true;
};
export type CompiledSkillResult =
  | (CompiledSkillBase & { type: "answer"; content: string })
  | (CompiledSkillBase & {
      type: "approval";
      id: string;
      summary: string;
      toolName: string;
      args: Record<string, unknown>;
    });

type Operation =
  | "list_accounts"
  | "query_campaign"
  | "query_ad_group"
  | "query_ad"
  | "query_target"
  | "query_portfolio"
  | "create_campaign"
  | "create_ad_group"
  | "create_ad"
  | "create_target"
  | "update_campaign"
  | "update_ad_group"
  | "update_ad"
  | "update_target"
  | "update_target_bid"
  | "delete_target"
  | "campaign_report"
  | "search_terms_report"
  | "product_ad_report"
  | "retrieve_report"
  | "clarify";

type SkillPlan = {
  operation: Operation;
  campaignId?: string;
  campaignName?: string;
  portfolioId?: string;
  adGroupId?: string;
  adGroupName?: string;
  adId?: string;
  targetId?: string;
  name?: string;
  state?: "ENABLED" | "PAUSED";
  budget?: number;
  bid?: number;
  bidStrategy?: "MANUAL" | "SALES_DOWN_ONLY" | "SALES_UP_AND_DOWN";
  topOfSearch?: number;
  restOfSearch?: number;
  productPage?: number;
  amazonBusiness?: number;
  sku?: string;
  asin?: string;
  keyword?: string;
  matchType?: "BROAD" | "PHRASE" | "EXACT";
  negative?: boolean;
  startDate?: string;
  endDate?: string;
  reportId?: string;
  question?: string;
};

const OPERATIONS = `可执行 operation：
list_accounts；query_campaign；query_ad_group；query_ad；query_target；query_portfolio；
create_campaign；create_ad_group；create_ad；create_target；
update_campaign；update_ad_group；update_ad；update_target；update_target_bid；delete_target；
campaign_report；search_terms_report；product_ad_report；retrieve_report；clarify。
字段仅可使用：campaignId,campaignName,portfolioId,adGroupId,adGroupName,adId,targetId,name,state,budget,bid,bidStrategy,topOfSearch,restOfSearch,productPage,amazonBusiness,sku,asin,keyword,matchType,negative,startDate,endDate,reportId,question。
规则：ID 保持字符串；暂停=PAUSED，启用=ENABLED；Fixed bids=MANUAL，动态只降低=SALES_DOWN_ONLY，动态提高和降低=SALES_UP_AND_DOWN；否定关键词 negative=true 且不输出 bid；删除/归档关键词=delete_target；修改关键词竞价=update_target_bid；Product Ad 使用 SKU 或 ASIN；信息不足则 operation=clarify 并给 question。只输出一个 JSON 对象。`;

const OPERATIONAL =
  /amazon|广告|campaign|活动|ad\s*group|广告组|product\s*ad|商品广告|target|keyword|关键词|竞价|bid|预算|portfolio|报表|花费|销售额|搜索词|数据|表现/i;
const ACTION =
  /查|看|列出|创建|新建|添加|修改|更新|调整|暂停|启用|归档|删除|报表|哪个|哪一个|最高|最低|最多|最少|排名|排行|top|report|query|create|update|pause|enable|archive|delete/i;
const STRATEGY =
  /为什么|原因|诊断|分析|优化建议|策略|趋势|对比|怎么提升|如何改善|浪费|异常/i;
const VAGUE_QUERY =
  /^(?:请)?(?:帮我)?(?:查|查询|查看|看看|查一下|查询一下)(?:数据|广告数据|账户数据|店铺数据)?[。.!！?？]*$/i;
const KNOWN_ACCOUNT_QUESTION =
  /account\s*id|accountid|marketplace|profile\s*id|账户|账号|店铺|站点/i;
export const COMPILED_SKILL_TOOLS = [
  "ads_accounts-list_ads_accounts",
  "campaign_management-query_campaign",
  "campaign_management-query_ad_group",
  "campaign_management-query_ad",
  "campaign_management-query_target",
  "campaign_management-query_portfolio",
  "campaign_management-create_campaign",
  "campaign_management-create_ad_group",
  "campaign_management-create_ad",
  "campaign_management-create_target",
  "campaign_management-update_campaign",
  "campaign_management-update_ad_group",
  "campaign_management-update_ad",
  "campaign_management-update_target",
  "campaign_management-update_target_bid",
  "campaign_management-delete_target",
  "reporting-create_campaign_report",
  "reporting-create_report",
  "reporting-retrieve_report",
] as const;

let toolCache: { expiresAt: number; tools: McpTool[] } | null = null;
async function cachedTools(client: AmazonMcpClient): Promise<McpTool[]> {
  if (toolCache && toolCache.expiresAt > Date.now()) return toolCache.tools;
  const tools = await client.listTools();
  toolCache = { expiresAt: Date.now() + 10 * 60_000, tools };
  return tools;
}

function deterministicPlan(message: string): SkillPlan | null {
  const ids = message.match(/\b\d{8,20}\b/g) ?? [];
  if (/(?:create|new)\s+campaign/i.test(message)) {
    const name = message
      .match(
        /campaign\s+(?:named?|called)\s+["']?(.+?)(?:["']?\s+with\s+budget|["']?\s+budget|["']?\s*,|["']?$)/i,
      )?.[1]
      ?.trim();
    const budget = Number(
      message.match(/budget\s*(?:is|=|:)?\s*\$?([0-9]+(?:\.[0-9]+)?)/i)?.[1],
    );
    const state = /paused/i.test(message)
      ? ("PAUSED" as const)
      : ("ENABLED" as const);
    return {
      operation: "create_campaign",
      name,
      budget,
      state,
      bidStrategy: /sales.?down/i.test(message)
        ? "SALES_DOWN_ONLY"
        : /sales.?up/i.test(message)
          ? "SALES_UP_AND_DOWN"
          : "MANUAL",
    };
  }
  const quoted = message.match(/[“"']([^”"']+)[”"']/)?.[1]?.trim();
  const state = /暂停|pause/i.test(message)
    ? ("PAUSED" as const)
    : /启用|enable/i.test(message)
      ? ("ENABLED" as const)
      : undefined;
  const bid = Number(
    message.match(
      /(?:bid|竞价)\s*(?:为|到|=|:|：)?\s*[$￥¥]?\s*(\d+(?:\.\d+)?)/i,
    )?.[1],
  );
  const budget = Number(
    message.match(
      /(?:日预算|预算)\s*(?:为|到|=|:|：)?\s*[$￥¥]?\s*(\d+(?:\.\d+)?)/i,
    )?.[1],
  );
  const adGroupId = ids[0];
  const asin = message
    .match(/\bASIN\s*(?:is|为|:)?\s*([A-Z0-9]{10})\b/i)?.[1]
    ?.toUpperCase();
  const sku = message.match(/\bSKU\s*(?:is|为|:)?\s*([A-Za-z0-9._-]+)\b/i)?.[1];
  if (
    /(?:create|new|创建|新建|添加)\s+(?:a\s+)?(?:sponsored\s+products\s+)?(?:product\s+)?ad/i.test(
      message,
    ) &&
    adGroupId &&
    (asin || sku)
  ) {
    return {
      operation: "create_ad",
      adGroupId,
      ...(asin ? { asin } : { sku }),
      state: /paused/i.test(message) ? "PAUSED" : "ENABLED",
    };
  }
  if (
    /(?:create|new)\s+(?:a\s+)?(?:negative\s+)?(?:keyword|target)/i.test(
      message,
    ) &&
    adGroupId
  ) {
    const keyword =
      message.match(/(?:keyword|关键词)\s*["“']([^"”']+)["”']/i)?.[1] ??
      message
        .match(
          /keyword\s+(?:is\s+)?([^,，]+?)(?:\s+(?:with\s+)?(?:bid|match)|$)/i,
        )?.[1]
        ?.trim();
    const matchType = /exact/i.test(message)
      ? "EXACT"
      : /phrase/i.test(message)
        ? "PHRASE"
        : /broad/i.test(message)
          ? "BROAD"
          : undefined;
    if (keyword && matchType)
      return {
        operation: "create_target",
        adGroupId,
        keyword,
        matchType,
        negative: /negative|否定/i.test(message),
        bid: Number.isFinite(bid) ? bid : undefined,
      };
  }
  if (
    /(?:update|change|modify|set|调整|修改|更新)/i.test(message) &&
    /ad\s*group|广告组/i.test(message) &&
    adGroupId &&
    Number.isFinite(bid)
  ) {
    return { operation: "update_ad_group", adGroupId, bid };
  }
  if (
    /查询|列出|看看|查看|query/i.test(message) &&
    /账户|账号|profile/i.test(message)
  )
    return { operation: "list_accounts" };
  if (/继续|轮询|retrieve/i.test(message) && /报表|report/i.test(message)) {
    const reportId = message.match(
      /(?:report\s*id|报表\s*id)\s*(?:为|是|=|:|：)?\s*([A-Za-z0-9._:-]{8,})/i,
    )?.[1];
    if (reportId) return { operation: "retrieve_report", reportId };
  }
  if (
    /归档|删除|archive|delete/i.test(message) &&
    /target|keyword|关键词/i.test(message) &&
    ids[0]
  )
    return { operation: "delete_target", targetId: ids[0] };
  if (
    /修改|调整|更新|change|update/i.test(message) &&
    /bid|竞价/i.test(message) &&
    /target|keyword|关键词/i.test(message) &&
    ids[0] &&
    Number.isFinite(bid)
  )
    return { operation: "update_target_bid", targetId: ids[0], bid };
  if (state && ids[0]) {
    if (/ad\s*group|广告组/i.test(message))
      return { operation: "update_ad_group", adGroupId: ids[0], state };
    if (/product\s*ad|商品广告|广告商品/i.test(message))
      return { operation: "update_ad", adId: ids[0], state };
    if (/target|keyword|关键词/i.test(message))
      return { operation: "update_target", targetId: ids[0], state };
    if (/campaign|广告活动|活动/i.test(message))
      return { operation: "update_campaign", campaignId: ids[0], state };
  }
  if (
    /修改|调整|更新|change|update/i.test(message) &&
    /预算/i.test(message) &&
    ids[0] &&
    Number.isFinite(budget)
  )
    return { operation: "update_campaign", campaignId: ids[0], budget };
  if (/查询|列出|看看|查看|query/i.test(message)) {
    if (/portfolio|组合/i.test(message))
      return ids[0]
        ? { operation: "query_campaign", portfolioId: ids[0] }
        : { operation: "query_portfolio" };
    if (/target|keyword|关键词/i.test(message))
      return {
        operation: "query_target",
        targetId: ids[0],
        campaignId: ids[1],
      };
    if (/product\s*ad|商品广告|广告商品/i.test(message))
      return { operation: "query_ad", adId: ids[0], campaignId: ids[1] };
    if (/ad\s*group|广告组/i.test(message))
      return {
        operation: "query_ad_group",
        adGroupId: ids[0],
        campaignId: ids[1],
      };
    if (/campaign|广告活动|活动/i.test(message))
      return {
        operation: "query_campaign",
        campaignId: ids[0],
        campaignName: ids[0] ? undefined : quoted,
      };
  }
  return null;
}

export function shouldUseCompiledSkill(message: string): boolean {
  return (
    VAGUE_QUERY.test(message.trim()) ||
    (OPERATIONAL.test(message) &&
      ACTION.test(message) &&
      !STRATEGY.test(message))
  );
}

function selectedAccountClarification(row: Record<string, unknown>): string {
  const name = String(row.name ?? "当前店铺");
  const marketplace = String(row.marketplace ?? "").toUpperCase();
  const profileId = String(row.profile_id ?? "");
  const details = [
    marketplace && `${marketplace} 站点`,
    profileId && `Profile ${profileId}`,
  ]
    .filter(Boolean)
    .join("，");
  return `当前已使用你在页面选择的店铺「${name}」${details ? `（${details}）` : ""}，无需再提供 accountId 或 marketplace。请告诉我想查询 Campaign、Ad Group、Product Ad、关键词/Target，还是某个日期范围的广告报表。`;
}

function safeClarification(
  question: string,
  row: Record<string, unknown>,
): string {
  return KNOWN_ACCOUNT_QUESTION.test(question)
    ? selectedAccountClarification(row)
    : question;
}

function stripJsonFence(value: string): string {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  return (fenced ?? value).trim();
}

async function parseStream(response: Response): Promise<string> {
  if (!response.body) throw new Error("模型未返回流");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "",
    content = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const event = JSON.parse(raw) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        content += event.choices?.[0]?.delta?.content ?? "";
      } catch {
        /* ignore non-JSON keepalive */
      }
    }
  }
  return content;
}

function normalizePlan(value: unknown): SkillPlan {
  if (!value || typeof value !== "object")
    return {
      operation: "clarify",
      question: "请补充需要操作的广告对象和参数。",
    };
  const plan = value as Record<string, unknown>;
  const allowed: Operation[] = [
    "list_accounts",
    "query_campaign",
    "query_ad_group",
    "query_ad",
    "query_target",
    "query_portfolio",
    "create_campaign",
    "create_ad_group",
    "create_ad",
    "create_target",
    "update_campaign",
    "update_ad_group",
    "update_ad",
    "update_target",
    "update_target_bid",
    "delete_target",
    "campaign_report",
    "search_terms_report",
    "product_ad_report",
    "retrieve_report",
    "clarify",
  ];
  const operation = allowed.includes(plan.operation as Operation)
    ? (plan.operation as Operation)
    : "clarify";
  const result: SkillPlan = { operation };
  for (const key of [
    "campaignId",
    "campaignName",
    "portfolioId",
    "adGroupId",
    "adGroupName",
    "adId",
    "targetId",
    "name",
    "sku",
    "asin",
    "keyword",
    "startDate",
    "endDate",
    "reportId",
    "question",
  ] as const) {
    if (typeof plan[key] === "string" && plan[key].trim())
      result[key] = plan[key].trim();
  }
  for (const key of [
    "budget",
    "bid",
    "topOfSearch",
    "restOfSearch",
    "productPage",
    "amazonBusiness",
  ] as const) {
    const number = Number(plan[key]);
    if (Number.isFinite(number)) result[key] = number;
  }
  if (["ENABLED", "PAUSED"].includes(String(plan.state)))
    result.state = plan.state as SkillPlan["state"];
  if (
    ["MANUAL", "SALES_DOWN_ONLY", "SALES_UP_AND_DOWN"].includes(
      String(plan.bidStrategy),
    )
  )
    result.bidStrategy = plan.bidStrategy as SkillPlan["bidStrategy"];
  if (["BROAD", "PHRASE", "EXACT"].includes(String(plan.matchType)))
    result.matchType = plan.matchType as SkillPlan["matchType"];
  if (typeof plan.negative === "boolean") result.negative = plan.negative;
  return result;
}

async function planWithSmallModel(
  userId: string,
  message: string,
  row: Record<string, unknown>,
): Promise<SkillPlan> {
  const config = await modelConfigForUser(userId);
  const marketplace = String(row.marketplace ?? "").toUpperCase();
  const timezone = String(row.timezone ?? "UTC");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const system = `你是 Amazon Ads 后端 Skill 的轻量参数编译器，不回答业务问题，不调用工具。前端已经选择账户，后端已经完成鉴权；下方账户字段是本次请求的权威默认值。绝不能要求用户再次提供 accountId、marketplace、Profile ID、账户、店铺或站点。只有查询对象、指标、日期范围或写操作参数确实缺失时才 clarify。${OPERATIONS}`;
  const user = `已选择账户：internalAccountId=${String(row.id ?? "")}；name=${String(row.name ?? "")}；region=${String(row.region ?? "").toUpperCase()}；marketplace=${marketplace || "未知"}；profileId=${String(row.profile_id ?? "")}；advertiserAccountId=${String(row.advertiser_account_id ?? "")}；timezone=${timezone}；currency=${String(row.currency ?? "")}；当地日期=${today}。\n用户指令：${message}`;
  const body = JSON.stringify({
    model: config.modelName,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    stream: true,
    temperature: 0,
    max_tokens: 700,
  });
  console.info("compiled_skill_planner_metrics", {
    model: config.modelName,
    requestChars: body.length,
    catalogChars: OPERATIONS.length,
    messageChars: message.length,
  });
  const response = await fetch(modelEndpoint(config), {
    method: "POST",
    headers: modelHeaders(config),
    body,
  });
  if (!response.ok)
    throw new Error(
      `Skill 参数解析失败 (${response.status}): ${(await response.text()).slice(0, 160)}`,
    );
  let text = "",
    usage: ProviderUsage | undefined;
  if (
    (response.headers.get("content-type") ?? "").includes("text/event-stream")
  )
    text = await parseStream(response);
  else {
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: ProviderUsage;
    };
    text = String(data.choices?.[0]?.message?.content ?? "");
    usage = data.usage;
  }
  await recordTokenUsage({
    userId,
    modelName: config.modelName,
    modelSource: config.source,
    operation: "compiled_skill.plan",
    usage,
    request: body,
    response: text,
  });
  try {
    return normalizePlan(JSON.parse(stripJsonFence(text)));
  } catch {
    return {
      operation: "clarify",
      question:
        "我没有可靠识别出对象和参数。请补充 Campaign、Ad Group、Ad 或 Target 的真实 API ID。",
    };
  }
}

function required(
  plan: SkillPlan,
  fields: Array<keyof SkillPlan>,
  question: string,
): SkillPlan | null {
  return fields.some((field) => plan[field] === undefined || plan[field] === "")
    ? { operation: "clarify", question }
    : null;
}

function placements(plan: SkillPlan) {
  if (
    [
      plan.topOfSearch,
      plan.restOfSearch,
      plan.productPage,
      plan.amazonBusiness,
    ].every((value) => value === undefined)
  )
    return undefined;
  return [
    { placement: "TOP_OF_SEARCH", percentage: plan.topOfSearch ?? 0 },
    { placement: "REST_OF_SEARCH", percentage: plan.restOfSearch ?? 0 },
    { placement: "PRODUCT_PAGE", percentage: plan.productPage ?? 0 },
    { placement: "SITE_AMAZON_BUSINESS", percentage: plan.amazonBusiness ?? 0 },
  ];
}

function buildToolCall(
  plan: SkillPlan,
  row: Record<string, unknown>,
): { name: string; args: Record<string, unknown> } | { clarify: string } {
  const sp = { adProductFilter: { include: ["SPONSORED_PRODUCTS"] } };
  const country = String(row.marketplace ?? "US").toUpperCase() || "US";
  const currency = String(
    row.currency ?? (country === "US" ? "USD" : "USD"),
  ).toUpperCase();
  const body: Record<string, unknown> = {};
  switch (plan.operation) {
    case "list_accounts":
      return {
        name: "ads_accounts-list_ads_accounts",
        args: { body: { maxResults: 100 } },
      };
    case "query_campaign":
      Object.assign(body, sp, { maxResults: 1000 });
      if (plan.campaignId)
        body.campaignIdFilter = { include: [plan.campaignId] };
      else if (plan.portfolioId)
        body.portfolioIdFilter = { include: [plan.portfolioId] };
      else if (plan.campaignName)
        body.nameFilter = {
          include: [plan.campaignName],
          queryTermMatchType: "EXACT_MATCH",
        };
      return { name: "campaign_management-query_campaign", args: { body } };
    case "query_ad_group":
      Object.assign(body, sp, { maxResults: 1000 });
      if (plan.campaignId)
        body.campaignIdFilter = { include: [plan.campaignId] };
      if (plan.adGroupId) body.adGroupIdFilter = { include: [plan.adGroupId] };
      return { name: "campaign_management-query_ad_group", args: { body } };
    case "query_ad":
      Object.assign(body, sp, { maxResults: 1000 });
      if (plan.campaignId)
        body.campaignIdFilter = { include: [plan.campaignId] };
      if (plan.adGroupId) body.adGroupIdFilter = { include: [plan.adGroupId] };
      if (plan.adId) body.adIdFilter = { include: [plan.adId] };
      return { name: "campaign_management-query_ad", args: { body } };
    case "query_target":
      Object.assign(body, sp, { maxResults: 1000 });
      if (plan.campaignId)
        body.campaignIdFilter = { include: [plan.campaignId] };
      if (plan.adGroupId) body.adGroupIdFilter = { include: [plan.adGroupId] };
      if (plan.targetId) body.targetIdFilter = { include: [plan.targetId] };
      return { name: "campaign_management-query_target", args: { body } };
    case "query_portfolio":
      return {
        name: "campaign_management-query_portfolio",
        args: { body: { maxResults: 100 } },
      };
    case "create_campaign": {
      const missing = required(
        plan,
        ["name", "budget"],
        "创建 Campaign 还需要名称和每日预算，例如：创建 Campaign“新品测试”，日预算 20 美元。",
      );
      if (missing) return { clarify: missing.question! };
      const bidAdjustments = placements(plan);
      const portfolioId =
        plan.portfolioId ??
        String(row.portfolio_id ?? row.portfolioId ?? "164504218094375");
      const campaign: Record<string, unknown> = {
        adProduct: "SPONSORED_PRODUCTS",
        name: plan.name,
        ...(portfolioId ? { portfolioId } : {}),
        state: plan.state ?? "PAUSED",
        autoCreationSettings: { autoCreateTargets: false },
        countries: [country],
        marketplaceScope: "SINGLE_MARKETPLACE",
        marketplaces: [country],
        startDateTime: `${plan.startDate ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`,
        budgets: [
          {
            budgetType: "MONETARY",
            budgetValue: {
              monetaryBudgetValue: { monetaryBudget: { value: plan.budget } },
            },
            recurrenceTimePeriod: "DAILY",
          },
        ],
        optimizations: {
          bidSettings: {
            bidStrategy: plan.bidStrategy ?? "MANUAL",
            ...(bidAdjustments
              ? { bidAdjustments: { placementBidAdjustments: bidAdjustments } }
              : {}),
          },
          budgetSettings: {
            budgetAllocation: "MANUAL",
            offAmazonBudgetControlStrategy: "MAXIMIZE_REACH",
          },
        },
      };
      if (plan.endDate) campaign.endDateTime = `${plan.endDate}T23:59:59Z`;
      return {
        name: "campaign_management-create_campaign",
        args: { body: { campaigns: [campaign] } },
      };
    }
    case "create_ad_group": {
      const missing = required(
        plan,
        ["campaignId", "name", "bid"],
        "创建 Ad Group 需要 Campaign API ID、名称和默认 Bid。",
      );
      if (missing) return { clarify: missing.question! };
      return {
        name: "campaign_management-create_ad_group",
        args: {
          body: {
            adGroups: [
              {
                adProduct: "SPONSORED_PRODUCTS",
                campaignId: plan.campaignId,
                name: plan.name,
                state: plan.state ?? "ENABLED",
                bid: { defaultBid: plan.bid },
              },
            ],
          },
        },
      };
    }
    case "create_ad": {
      const missing = required(
        plan,
        ["adGroupId"],
        "添加 Product Ad 需要 Ad Group API ID，以及 SKU 或 ASIN。",
      );
      if (missing || (!plan.sku && !plan.asin))
        return {
          clarify: missing?.question ?? "请提供 Product Ad 的 SKU 或 ASIN。",
        };
      const productId = plan.sku ?? plan.asin!;
      const productIdType = plan.sku ? "SKU" : "ASIN";
      return {
        name: "campaign_management-create_ad",
        args: {
          body: {
            ads: [
              {
                adGroupId: plan.adGroupId,
                adProduct: "SPONSORED_PRODUCTS",
                adType: "PRODUCT_AD",
                state: plan.state ?? "ENABLED",
                creative: {
                  productCreative: {
                    productCreativeSettings: {
                      advertisedProduct: { productId, productIdType },
                    },
                  },
                },
              },
            ],
          },
        },
      };
    }
    case "create_target": {
      const missing = required(
        plan,
        ["adGroupId", "keyword", "matchType"],
        "添加关键词需要 Ad Group API ID、关键词和匹配方式（Broad、Phrase 或 Exact）。",
      );
      if (missing) return { clarify: missing.question! };
      if (!plan.negative && plan.bid === undefined)
        return {
          clarify: "正向关键词还需要 Bid；否定关键词请明确说明“否定”。",
        };
      const target: Record<string, unknown> = {
        adGroupId: plan.adGroupId,
        adProduct: "SPONSORED_PRODUCTS",
        negative: plan.negative ?? false,
        state: plan.state ?? "ENABLED",
        targetType: "KEYWORD",
        targetDetails: {
          keywordTarget: { keyword: plan.keyword, matchType: plan.matchType },
        },
      };
      if (!plan.negative) target.bid = { bid: plan.bid };
      return {
        name: "campaign_management-create_target",
        args: { body: { targets: [target] } },
      };
    }
    case "update_campaign": {
      const missing = required(
        plan,
        ["campaignId"],
        "修改 Campaign 需要真实数字型 Campaign API ID。",
      );
      if (missing) return { clarify: missing.question! };
      const campaign: Record<string, unknown> = { campaignId: plan.campaignId };
      if (plan.state) campaign.state = plan.state;
      if (plan.portfolioId) campaign.portfolioId = plan.portfolioId;
      if (plan.budget !== undefined)
        campaign.budgets = [
          {
            budgetType: "MONETARY",
            budgetValue: {
              monetaryBudgetValue: { monetaryBudget: { value: plan.budget } },
            },
            recurrenceTimePeriod: "DAILY",
          },
        ];
      const placementBidAdjustments = placements(plan);
      if (plan.bidStrategy || placementBidAdjustments)
        campaign.optimizations = {
          bidSettings: {
            bidStrategy: plan.bidStrategy ?? "MANUAL",
            ...(placementBidAdjustments
              ? { bidAdjustments: { placementBidAdjustments } }
              : {}),
          },
          budgetSettings: {
            budgetAllocation: "MANUAL",
            offAmazonBudgetControlStrategy: "MAXIMIZE_REACH",
          },
        };
      if (Object.keys(campaign).length === 1)
        return {
          clarify:
            "请说明需要修改的预算、状态、竞价策略、Placement 或 Portfolio ID。",
        };
      return {
        name: "campaign_management-update_campaign",
        args: { body: { campaigns: [campaign] } },
      };
    }
    case "update_ad_group": {
      const missing = required(
        plan,
        ["adGroupId", "state"],
        "暂停或启用 Ad Group 需要 Ad Group API ID 和目标状态。",
      );
      if (missing) return { clarify: missing.question! };
      return {
        name: "campaign_management-update_ad_group",
        args: {
          body: {
            adGroups: [{ adGroupId: plan.adGroupId, state: plan.state }],
          },
        },
      };
    }
    case "update_ad": {
      const missing = required(
        plan,
        ["adId", "state"],
        "暂停或启用 Product Ad 需要真实 Ad API ID 和目标状态；SKU/ASIN 需要先查询成 Ad ID。",
      );
      if (missing) return { clarify: missing.question! };
      return {
        name: "campaign_management-update_ad",
        args: { body: { ads: [{ adId: plan.adId, state: plan.state }] } },
      };
    }
    case "update_target": {
      const missing = required(
        plan,
        ["targetId", "state"],
        "暂停或启用关键词需要 Target API ID 和目标状态。",
      );
      if (missing) return { clarify: missing.question! };
      return {
        name: "campaign_management-update_target",
        args: {
          body: { targets: [{ targetId: plan.targetId, state: plan.state }] },
        },
      };
    }
    case "update_target_bid": {
      const missing = required(
        plan,
        ["targetId", "bid"],
        "修改关键词 Bid 需要 Target API ID 和新 Bid。",
      );
      if (missing) return { clarify: missing.question! };
      return {
        name: "campaign_management-update_target_bid",
        args: {
          body: {
            targets: [{ targetId: plan.targetId, bid: { bid: plan.bid } }],
          },
        },
      };
    }
    case "delete_target": {
      const missing = required(
        plan,
        ["targetId"],
        "归档关键词需要 Target API ID；归档不可恢复。",
      );
      if (missing) return { clarify: missing.question! };
      return {
        name: "campaign_management-delete_target",
        args: { body: { targetIds: [plan.targetId] } },
      };
    }
    case "campaign_report":
      if (!plan.startDate || !plan.endDate)
        return {
          clarify:
            "Campaign 报表需要日期范围，例如“最近 7 个完整自然日”或明确的开始、结束日期。",
        };
      return {
        name: "reporting-create_campaign_report",
        args: {
          body: {
            reports: [
              {
                currencyOfView: currency,
                format: "CSV",
                periods: [
                  {
                    datePeriod: {
                      startDate: plan.startDate,
                      endDate: plan.endDate,
                    },
                  },
                ],
              },
            ],
          },
        },
      };
    case "search_terms_report":
      if (!plan.startDate || !plan.endDate)
        return { clarify: "Search Terms 报表需要日期范围。" };
      return {
        name: "reporting-create_report",
        args: {
          body: {
            reports: [
              {
                currencyOfView: currency,
                format: "CSV",
                periods: [
                  {
                    datePeriod: {
                      startDate: plan.startDate,
                      endDate: plan.endDate,
                    },
                  },
                ],
                query: {
                  fields: [
                    "budgetCurrency.value",
                    "date.value",
                    "advertiserAccount.id",
                    "campaign.id",
                    "campaign.name",
                    "adGroup.id",
                    "adGroup.name",
                    "searchTerm.value",
                    "metric.impressions",
                    "metric.clicks",
                    "metric.ctr",
                    "metric.totalCost",
                    "metric.purchases",
                    "metric.sales",
                    "metric.unitsSold",
                    "metric.costPerPurchase",
                    "metric.purchaseRate",
                    "metric.roas",
                    "metric.purchasesPromoted",
                    "metric.salesPromoted",
                  ],
                },
              },
            ],
          },
        },
      };
    case "product_ad_report":
      if (!plan.startDate || !plan.endDate)
        return { clarify: "Product Ad 报表需要日期范围。" };
      return {
        name: "reporting-create_report",
        args: {
          body: {
            reports: [
              {
                currencyOfView: currency,
                format: "CSV",
                periods: [
                  {
                    datePeriod: {
                      startDate: plan.startDate,
                      endDate: plan.endDate,
                    },
                  },
                ],
                query: {
                  fields: [
                    "budgetCurrency.value",
                    "date.value",
                    "advertiserAccount.id",
                    "campaign.id",
                    "campaign.name",
                    "adGroup.id",
                    "adGroup.name",
                    "ad.id",
                    "advertisedProduct.id",
                    "advertisedProductMarketplace.value",
                    "metric.impressions",
                    "metric.clicks",
                    "metric.ctr",
                    "metric.totalCost",
                    "metric.purchases",
                    "metric.sales",
                    "metric.unitsSold",
                    "metric.costPerPurchase",
                    "metric.purchaseRate",
                    "metric.roas",
                    "metric.purchasesPromoted",
                    "metric.salesPromoted",
                  ],
                },
              },
            ],
          },
        },
      };
    case "retrieve_report": {
      const missing = required(
        plan,
        ["reportId"],
        "继续轮询报表需要 Report ID。",
      );
      if (missing) return { clarify: missing.question! };
      return {
        name: "reporting-retrieve_report",
        args: { body: { reportIds: [plan.reportId] } },
      };
    }
    case "clarify":
      return { clarify: plan.question ?? "请补充需要操作的对象和参数。" };
  }
}

function parseEmbedded(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function collectObjects(value: unknown, rows: Record<string, unknown>[]): void {
  value = parseEmbedded(value);
  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, rows);
    return;
  }
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  rows.push(object);
  for (const item of Object.values(object)) collectObjects(item, rows);
}

function deepString(
  object: Record<string, unknown>,
  keys: string[],
): string | undefined {
  const queue: unknown[] = [object];
  while (queue.length) {
    const current = parseEmbedded(queue.shift());
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    if (!current || typeof current !== "object") continue;
    for (const [key, value] of Object.entries(
      current as Record<string, unknown>,
    )) {
      if (
        keys.includes(key.toLowerCase()) &&
        ["string", "number"].includes(typeof value)
      )
        return String(value);
      if ((value && typeof value === "object") || typeof value === "string")
        queue.push(value);
    }
  }
  return undefined;
}

function formatReadResult(name: string, result: unknown): string {
  const rows: Record<string, unknown>[] = [];
  collectObjects(result, rows);
  const idKeys = [
    "campaignid",
    "adgroupid",
    "adid",
    "targetid",
    "profileid",
    "advertiseraccountid",
    "portfolioid",
  ];
  const summaries = new Map<string, string>();
  for (const row of rows) {
    const id = deepString(row, idKeys);
    if (!id || summaries.has(id)) continue;
    const label = deepString(row, [
      "name",
      "campaignname",
      "adgroupname",
      "keyword",
      "productid",
      "resolvedproductid",
      "searchterm",
    ]);
    const state = deepString(row, ["state", "deliverystatus", "status"]);
    const bid = deepString(row, ["defaultbid", "bid"]);
    const budget = deepString(row, ["monetarybudget", "budget", "budgetvalue"]);
    summaries.set(
      id,
      `- ${label ? `${label} · ` : ""}ID ${id}${state ? ` · ${state}` : ""}${budget ? ` · 预算 ${budget}` : ""}${bid ? ` · Bid ${bid}` : ""}`,
    );
    if (summaries.size >= 60) break;
  }
  if (summaries.size)
    return `已由内置后端 Skill 调用 ${name}，没有把 MCP Schema 或结果正文发送给大模型。\n\n${[...summaries.values()].join("\n")}`;
  const safe = JSON.stringify(result).replace(
    /https:\/\/[^\s"'<>\\]+/g,
    "[签名地址已隐藏]",
  );
  return `已由内置后端 Skill 调用 ${name}。Amazon 返回结果如下：\n\n${safe.slice(0, 10000)}${safe.length > 10000 ? "\n[结果过长，已在后端截断显示]" : ""}`;
}

function reportAnswer(result: unknown): string {
  const reports =
    result &&
    typeof result === "object" &&
    Array.isArray((result as { downloadedReports?: unknown }).downloadedReports)
      ? (
          result as {
            downloadedReports: Array<{
              rowCount?: number;
              aggregates?: Record<string, number>;
            }>;
          }
        ).downloadedReports
      : [];
  const totals: Record<string, number> = {};
  let rows = 0;
  for (const report of reports) {
    rows += report.rowCount ?? 0;
    for (const [key, value] of Object.entries(report.aggregates ?? {}))
      totals[key] = (totals[key] ?? 0) + value;
  }
  return `已由内置报表 Skill 完成创建、轮询、下载和后端 CSV 解析，没有把 CSV 发送给大模型。\n\n数据行：${rows}\n${
    Object.entries(totals)
      .map(
        ([key, value]) =>
          `${key}：${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value)}`,
      )
      .join("\n") || "报表已保存，可在“报表记录”中下载。"
  }`;
}

function preflightFor(
  name: string,
  plan: SkillPlan,
): { name: string; args: Record<string, unknown> } | null {
  if (name === "campaign_management-update_campaign")
    return buildToolCall(
      { operation: "query_campaign", campaignId: plan.campaignId },
      {},
    ) as { name: string; args: Record<string, unknown> };
  if (name === "campaign_management-update_ad_group")
    return buildToolCall(
      { operation: "query_ad_group", adGroupId: plan.adGroupId },
      {},
    ) as { name: string; args: Record<string, unknown> };
  if (name === "campaign_management-update_ad")
    return buildToolCall({ operation: "query_ad", adId: plan.adId }, {}) as {
      name: string;
      args: Record<string, unknown>;
    };
  if (
    [
      "campaign_management-update_target",
      "campaign_management-update_target_bid",
      "campaign_management-delete_target",
    ].includes(name)
  )
    return buildToolCall(
      { operation: "query_target", targetId: plan.targetId },
      {},
    ) as { name: string; args: Record<string, unknown> };
  if (name === "campaign_management-create_ad_group")
    return buildToolCall(
      { operation: "query_campaign", campaignId: plan.campaignId },
      {},
    ) as { name: string; args: Record<string, unknown> };
  return null;
}

export async function tryCompiledSkill(options: {
  userId: string;
  accountId: string;
  message: string;
  row: Record<string, unknown>;
  credentials: AmazonCredentials;
  onStatus?: (text: string) => void;
}): Promise<CompiledSkillResult | null> {
  const { userId, accountId, message, row, credentials, onStatus } = options;
  if (!shouldUseCompiledSkill(message)) return null;
  if (VAGUE_QUERY.test(message.trim())) {
    return {
      type: "answer",
      content: selectedAccountClarification(row),
      accountId,
      modelRounds: 0,
      compiledSkill: true,
    };
  }
  onStatus?.(
    "正在使用轻量 Skill 编译器提取操作与参数（不发送 MCP Schema 或操作手册）",
  );
  const localPlan = deterministicPlan(message);
  const plan = localPlan ?? (await planWithSmallModel(userId, message, row));
  const built = buildToolCall(plan, row);
  if ("clarify" in built)
    return {
      type: "answer",
      content: safeClarification(built.clarify, row),
      accountId,
      modelRounds: localPlan ? 0 : 1,
      compiledSkill: true,
    };
  const { name, args } = built;
  const fixed = new AmazonMcpClient(credentials, "FIXED");
  const live: McpTool[] = await cachedTools(fixed);
  if (!live.some((tool) => tool.name === name))
    throw new Error(
      `内置 Skill 需要的工具 ${name} 当前不在 Amazon MCP tools/list 中`,
    );
  if (isWriteTool(name)) {
    const preflight = preflightFor(name, plan);
    let current = "";
    if (preflight && "name" in preflight) {
      onStatus?.(`写操作前正在查询真实对象：${preflight.name}`);
      const result = await new AmazonMcpClient(
        credentials,
        modeForTool(preflight.name),
      ).callTool(preflight.name, preflight.args);
      current = `\n\n写前查询：\n${formatReadResult(preflight.name, result).slice(0, 4000)}`;
    }
    const id = crypto.randomUUID();
    const irreversible =
      name === "campaign_management-delete_target"
        ? "\n\n警告：归档 Target/Keyword 不可恢复。"
        : "";
    const summary = `内置 Skill 已按实测模板生成 ${name} 操作，请核对参数后批准。${current}${irreversible}`;
    await d1()
      .prepare(
        `INSERT INTO approvals(id,user_id,account_id,tool_name,tool_args,summary,status,created_at) VALUES(?,?,?,?,?,?,?,?)`,
      )
      .bind(
        id,
        userId,
        accountId,
        name,
        JSON.stringify(args),
        summary,
        "pending",
        Date.now(),
      )
      .run();
    return {
      type: "approval",
      id,
      summary,
      toolName: name,
      args,
      accountId,
      modelRounds: localPlan ? 0 : 1,
      compiledSkill: true,
    };
  }
  onStatus?.(`正在由后端 Skill 直接调用 ${name}`);
  const client = new AmazonMcpClient(credentials, modeForTool(name));
  const result = name.startsWith("reporting-")
    ? await executeReportTool(client, name, args, {
        userId,
        accountId,
        onStatus,
      })
    : await client.callTool(name, args);
  await d1()
    .prepare(
      `INSERT INTO audit_logs(id,user_id,account_id,action,target,detail,outcome,created_at) VALUES(?,?,?,?,?,?,?,?)`,
    )
    .bind(
      crypto.randomUUID(),
      userId,
      accountId,
      "skill.read",
      name,
      JSON.stringify({ operation: plan.operation }),
      "success",
      Date.now(),
    )
    .run();
  return {
    type: "answer",
    content: name.startsWith("reporting-")
      ? reportAnswer(result)
      : formatReadResult(name, result),
    accountId,
    modelRounds: localPlan ? 0 : 1,
    compiledSkill: true,
  };
}
