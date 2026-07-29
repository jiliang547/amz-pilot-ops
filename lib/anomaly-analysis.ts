import { d1 } from "./db";
import { modelConfigForUser, modelEndpoint, modelHeaders } from "./model-config";

export type AnalysisKind = "campaign" | "keyword" | "searchTerm";
export type StoredAnomaly = {
  objectName: string;
  objectId?: string;
  severity: "high" | "medium" | "low";
  anomaly: string;
  reason: string;
  evidence?: string;
};

const KINDS: AnalysisKind[] = ["campaign", "keyword", "searchTerm"];
const LABELS: Record<AnalysisKind, string> = {
  campaign: "广告活动和广告组",
  keyword: "投放关键词",
  searchTerm: "客户搜索词",
};
const TABLES: Record<AnalysisKind, string> = {
  campaign: "ad_daily_facts",
  keyword: "ad_keyword_daily_facts",
  searchTerm: "ad_search_term_daily_facts",
};

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function localDate(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function num(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

type DailyRow = {
  reportDate: string;
  campaignId: string;
  campaignName: string;
  adGroupId: string;
  adGroupName: string;
  entityId?: string;
  entityLabel?: string;
  impressions: number;
  clicks: number;
  cost: number;
  purchases: number;
  sales: number;
};

async function analysisRows(userId: string, accountId: string, kind: AnalysisKind, startDate: string, endDate: string) {
  const entityColumns = kind === "campaign"
    ? `campaign_id || ':' || ad_group_id entityId,COALESCE(NULLIF(campaign_name,''),campaign_id) || ' / ' || COALESCE(NULLIF(ad_group_name,''),ad_group_id) entityLabel`
    : kind === "keyword"
      ? `campaign_id || ':' || ad_group_id || ':' || keyword_id entityId,COALESCE(NULLIF(keyword,''),keyword_id) entityLabel`
      : `campaign_id || ':' || ad_group_id || ':' || keyword_id || ':' || search_term entityId,search_term entityLabel`;
  const result = await d1().prepare(
    `SELECT report_date reportDate,campaign_id campaignId,MAX(campaign_name) campaignName,ad_group_id adGroupId,MAX(ad_group_name) adGroupName,${entityColumns},
      SUM(impressions) impressions,SUM(clicks) clicks,SUM(cost) cost,SUM(purchases) purchases,SUM(sales) sales
     FROM ${TABLES[kind]}
     WHERE user_id=? AND account_id=? AND report_date BETWEEN ? AND ?
     GROUP BY report_date,campaign_id,ad_group_id,entityId,entityLabel
     ORDER BY cost DESC LIMIT 1200`,
  ).bind(userId, accountId, startDate, endDate).all<DailyRow>();

  const entities = new Map<string, {
    objectId: string; objectName: string; campaignName: string; adGroupName: string;
    impressions: number; clicks: number; cost: number; purchases: number; sales: number;
    daily: Map<string, { cost: number; sales: number; purchases: number; clicks: number; impressions: number }>;
  }>();
  for (const row of result.results) {
    const key = String(row.entityId ?? "");
    if (!key) continue;
    const current = entities.get(key) ?? {
      objectId: key, objectName: String(row.entityLabel ?? key), campaignName: String(row.campaignName ?? ""),
      adGroupName: String(row.adGroupName ?? ""), impressions: 0, clicks: 0, cost: 0, purchases: 0, sales: 0, daily: new Map(),
    };
    current.impressions += num(row.impressions); current.clicks += num(row.clicks); current.cost += num(row.cost);
    current.purchases += num(row.purchases); current.sales += num(row.sales);
    current.daily.set(String(row.reportDate), { cost: num(row.cost), sales: num(row.sales), purchases: num(row.purchases), clicks: num(row.clicks), impressions: num(row.impressions) });
    entities.set(key, current);
  }

  return [...entities.values()].sort((a, b) => b.cost - a.cost).slice(0, 60).map(entity => {
    const days = Array.from({ length: 15 }, (_, index) => shiftDate(startDate, index));
    const series = days.map(date => entity.daily.get(date) ?? { cost: 0, sales: 0, purchases: 0, clicks: 0, impressions: 0 });
    const latest = series.at(-1)!, previous = series.slice(0, -1);
    const average = (field: keyof typeof latest) => previous.reduce((sum, item) => sum + item[field], 0) / Math.max(previous.length, 1);
    return {
      objectId: entity.objectId,
      objectName: entity.objectName,
      campaignName: entity.campaignName,
      adGroupName: entity.adGroupName,
      metrics15d: {
        impressions: round(entity.impressions, 0), clicks: round(entity.clicks, 0), cost: round(entity.cost),
        purchases: round(entity.purchases), sales: round(entity.sales),
        ctr: round(entity.impressions ? entity.clicks / entity.impressions * 100 : 0),
        cpc: round(entity.clicks ? entity.cost / entity.clicks : 0),
        acos: round(entity.sales ? entity.cost / entity.sales * 100 : 0),
        roas: round(entity.cost ? entity.sales / entity.cost : 0),
      },
      latestDay: Object.fromEntries(Object.entries(latest).map(([key, value]) => [key, round(value)])),
      previous14DayAverage: {
        cost: round(average("cost")), sales: round(average("sales")), purchases: round(average("purchases")),
        clicks: round(average("clicks")), impressions: round(average("impressions")),
      },
      dailyCost: series.map(item => round(item.cost)),
      dailySales: series.map(item => round(item.sales)),
      dailyOrders: series.map(item => round(item.purchases)),
    };
  });
}

function parseModelJson(content: string): { summary: string; anomalies: StoredAnomaly[] } {
  const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有返回可解析的 JSON");
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { summary?: unknown; anomalies?: unknown };
  const anomalies = Array.isArray(parsed.anomalies) ? parsed.anomalies.slice(0, 30).map(item => {
    const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const severity = ["high", "medium", "low"].includes(String(row.severity)) ? String(row.severity) as StoredAnomaly["severity"] : "medium";
    return {
      objectName: String(row.objectName ?? "未命名对象").slice(0, 300),
      objectId: String(row.objectId ?? "").slice(0, 500) || undefined,
      severity,
      anomaly: String(row.anomaly ?? "数据异常").slice(0, 500),
      reason: String(row.reason ?? "模型未提供原因").slice(0, 1200),
      evidence: String(row.evidence ?? "").slice(0, 1000) || undefined,
    };
  }) : [];
  return { summary: String(parsed.summary ?? "分析完成").slice(0, 2000), anomalies };
}

async function analyzeKind(userId: string, accountId: string, analysisDate: string, startDate: string, endDate: string, kind: AnalysisKind, force: boolean, onStatus?: (text: string) => void) {
  const existing = await d1().prepare(`SELECT id,status,model_name modelName,summary,anomalies_json anomaliesJson FROM ad_anomaly_analyses WHERE account_id=? AND analysis_date=? AND report_kind=?`).bind(accountId, analysisDate, kind).first<Record<string, unknown>>();
  if (!force && existing?.status === "COMPLETED") return { reportKind: kind, status: "COMPLETED", modelName: existing.modelName, summary: existing.summary, anomalies: JSON.parse(String(existing.anomaliesJson ?? "[]")) as StoredAnomaly[], reused: true };
  const id = String(existing?.id ?? crypto.randomUUID()), now = Date.now(), config = await modelConfigForUser(userId);
  const prompt = `这是亚马逊${LABELS[kind]}的广告报告，请帮我分析其中是否有数据异常以及异常的原因`;
  await d1().prepare(
    `INSERT INTO ad_anomaly_analyses(id,user_id,account_id,analysis_date,report_kind,start_date,end_date,model_name,status,prompt,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(account_id,analysis_date,report_kind) DO UPDATE SET start_date=excluded.start_date,end_date=excluded.end_date,model_name=excluded.model_name,status='RUNNING',prompt=excluded.prompt,error=NULL,updated_at=excluded.updated_at`,
  ).bind(id, userId, accountId, analysisDate, kind, startDate, endDate, config.modelName, "RUNNING", prompt, now, now).run();
  try {
    onStatus?.(`正在用 ${config.modelName} 分析近15天${LABELS[kind]}异常`);
    const rows = await analysisRows(userId, accountId, kind, startDate, endDate);
    if (!rows.length) throw new Error(`${LABELS[kind]}近15天没有可分析的数据`);
    const system = `你是亚马逊广告数据分析师。只分析提供的近15天数据，找出有业务意义的异常对象并解释原因。不要把正常波动当异常，不要臆造数据。重点关注花费突增、转化骤降、高花费零订单、ACOS恶化、曝光或点击异常变化。必须只返回一个完整JSON对象：{"summary":"总体结论","anomalies":[{"objectName":"异常对象","objectId":"对象ID","severity":"high|medium|low","anomaly":"异常现象","reason":"异常原因","evidence":"关键数据证据"}]}。最多返回8个最重要的异常；summary不超过150字，每个anomaly、reason、evidence分别不超过80、180、120字。不要输出Markdown、思考过程或JSON之外的文字。没有异常时anomalies返回空数组。`;
    const response = await fetch(modelEndpoint(config), {
      method: "POST",
      headers: modelHeaders(config),
      body: JSON.stringify({
        model: config.modelName,
        messages: [{ role: "system", content: system }, { role: "user", content: `${prompt}\n日期范围：${startDate} 至 ${endDate}\n报告数据：${JSON.stringify(rows)}` }],
        stream: false, temperature: 0.1, max_tokens: 4000, response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) throw new Error(`模型分析失败 (${response.status}): ${(await response.text()).slice(0, 240)}`);
    const data = await response.json() as { choices?: Array<{ message?: { content?: string | null; reasoning_content?: string | null } }> };
    const message = data.choices?.[0]?.message, content = message?.content || message?.reasoning_content || "";
    let parsed: { summary: string; anomalies: StoredAnomaly[] };
    try { parsed = parseModelJson(content); } catch { parsed = { summary: content.slice(0, 2000) || "模型分析完成，但返回了非结构化内容", anomalies: [{ objectName: `${LABELS[kind]}整体`, severity: "medium", anomaly: "模型返回非结构化异常结论", reason: content.slice(0, 1200) || "模型未返回可解析内容", evidence: "已保存原始模型响应，后续分析会继续要求结构化 JSON" }] }; }
    await d1().prepare(`UPDATE ad_anomaly_analyses SET status='COMPLETED',summary=?,anomalies_json=?,raw_response=?,error=NULL,completed_at=?,updated_at=? WHERE id=?`).bind(parsed.summary, JSON.stringify(parsed.anomalies), content.slice(0, 50000), Date.now(), Date.now(), id).run();
    return { reportKind: kind, status: "COMPLETED", modelName: config.modelName, ...parsed, reused: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await d1().prepare(`UPDATE ad_anomaly_analyses SET status='FAILED',error=?,updated_at=? WHERE id=?`).bind(message.slice(0, 1500), Date.now(), id).run();
    return { reportKind: kind, status: "FAILED", modelName: config.modelName, summary: "", anomalies: [] as StoredAnomaly[], error: message, reused: false };
  }
}

export async function runAnomalyAnalysis(userId: string, accountId: string, options: { force?: boolean; date?: string; onStatus?: (text: string) => void } = {}) {
  const account = await d1().prepare(`SELECT timezone FROM accounts WHERE id=? AND user_id=?`).bind(accountId, userId).first<{ timezone?: string }>();
  if (!account) throw new Error("店铺不存在");
  const today = localDate(String(account.timezone ?? "UTC")), analysisDate = options.date ?? today, endDate = options.date ?? shiftDate(today, -1), startDate = shiftDate(endDate, -14), analyses = [];
  for (const kind of KINDS) analyses.push(await analyzeKind(userId, accountId, analysisDate, startDate, endDate, kind, Boolean(options.force), options.onStatus));
  return { analysisDate, startDate, endDate, status: analyses.every(item => item.status === "COMPLETED") ? "COMPLETED" : "FAILED", analyses };
}

export async function anomalyHistory(userId: string, accountId: string, selectedDate?: string | null) {
  const datesResult = await d1().prepare(`SELECT DISTINCT analysis_date analysisDate FROM ad_anomaly_analyses WHERE user_id=? AND account_id=? ORDER BY analysis_date DESC LIMIT 120`).bind(userId, accountId).all<{ analysisDate: string }>();
  const dates = datesResult.results.map(item => item.analysisDate), analysisDate = selectedDate || dates[0] || null;
  if (!analysisDate) return { dates, analysisDate: null, analyses: [] };
  const result = await d1().prepare(`SELECT report_kind reportKind,start_date startDate,end_date endDate,model_name modelName,status,summary,anomalies_json anomaliesJson,error,completed_at completedAt FROM ad_anomaly_analyses WHERE user_id=? AND account_id=? AND analysis_date=? ORDER BY CASE report_kind WHEN 'campaign' THEN 1 WHEN 'keyword' THEN 2 ELSE 3 END`).bind(userId, accountId, analysisDate).all<Record<string, unknown>>();
  return {
    dates, analysisDate,
    analyses: result.results.map(row => ({
      reportKind: row.reportKind, startDate: row.startDate, endDate: row.endDate, modelName: row.modelName,
      status: row.status, summary: row.summary, error: row.error, completedAt: row.completedAt,
      anomalies: JSON.parse(String(row.anomaliesJson ?? "[]")) as StoredAnomaly[],
    })),
  };
}
