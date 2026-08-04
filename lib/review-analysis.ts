import { d1, ensureSchema } from "./db";
import { modelConfigForUser, modelEndpoint, modelHeaders } from "./model-config";
import { recordTokenUsage, type ProviderUsage } from "./token-usage";
import { jsonrepair } from "jsonrepair";

export type ReviewAnalysisResult = {
  executiveSummary: string;
  sampleSize: number;
  dataQuality: string;
  sentiment: {
    positivePct: number;
    neutralPct: number;
    negativePct: number;
    conclusion: string;
  };
  ratingBreakdown: Array<{ rating: number; count: number; pct: number }>;
  personas: Array<{ name: string; share: string; evidence: string }>;
  scenarios: Array<{ name: string; share: string; evidence: string }>;
  sellingPoints: Array<{ title: string; share: string; evidence: string; quote: string }>;
  painPoints: Array<{ title: string; share: string; evidence: string; quote: string }>;
  dimensionInsights: Array<{
    dimension: string;
    finding: string;
    confidence: "high" | "medium" | "low";
    evidence: string;
  }>;
  opportunities: Array<{ title: string; rationale: string; audience: string }>;
  actions: Array<{
    priority: "P0" | "P1" | "P2";
    title: string;
    details: string;
    evidence: string;
  }>;
  representativeQuotes: Array<{
    reviewId: string;
    rating: number;
    quote: string;
    insight: string;
  }>;
};

type ReviewRow = {
  reviewId: string;
  rating: number;
  title: string;
  reviewContent: string;
  reviewDate: string;
  verifiedPurchase: number;
  helpfulVotes: number;
  productVariant: string;
  imagesJson: string;
};

const DIMENSIONS = [
  "人群_性别", "人群_年龄段", "人群_职业", "人群_购买角色",
  "场景_使用场景", "功能_满意度", "功能_具体功能",
  "质量_材质", "质量_做工", "质量_耐用性",
  "服务_发货速度", "服务_包装质量", "服务_客服响应", "服务_退换货", "服务_保修",
  "体验_舒适度", "体验_易用性", "体验_外观设计", "体验_价格感知",
  "竞品_竞品对比", "复购_复购意愿", "情感_总体评价",
];

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function textValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function list(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function clampPct(value: unknown) {
  return Math.max(0, Math.min(100, Math.round(numberValue(value) * 10) / 10));
}

function normalizeAnalysis(value: unknown, sampleSize: number, ratings: ReviewAnalysisResult["ratingBreakdown"]): ReviewAnalysisResult {
  const row = object(value);
  const sentiment = object(row.sentiment);
  const normalizeNamed = (input: unknown, kind: "persona" | "scenario") =>
    list(input).slice(0, 8).map((item) => {
      const entry = object(item);
      return {
        name: textValue(entry.name, kind === "persona" ? "未命名人群" : "未命名场景").slice(0, 120),
        share: textValue(entry.share, "样本未充分提及").slice(0, 80),
        evidence: textValue(entry.evidence, "未提供证据").slice(0, 800),
      };
    });
  const normalizePoint = (input: unknown) =>
    list(input).slice(0, 10).map((item) => {
      const entry = object(item);
      return {
        title: textValue(entry.title, "未命名洞察").slice(0, 160),
        share: textValue(entry.share, "样本未充分提及").slice(0, 80),
        evidence: textValue(entry.evidence, "未提供证据").slice(0, 900),
        quote: textValue(entry.quote, "").slice(0, 700),
      };
    });
  const allowedPriority = new Set(["P0", "P1", "P2"]);
  const allowedConfidence = new Set(["high", "medium", "low"]);
  return {
    executiveSummary: textValue(row.executiveSummary, "评论分析已完成").slice(0, 3000),
    sampleSize,
    dataQuality: textValue(row.dataQuality, "基于当前已获取评论样本进行分析").slice(0, 1000),
    sentiment: {
      positivePct: clampPct(sentiment.positivePct),
      neutralPct: clampPct(sentiment.neutralPct),
      negativePct: clampPct(sentiment.negativePct),
      conclusion: textValue(sentiment.conclusion, "").slice(0, 1000),
    },
    ratingBreakdown: ratings,
    personas: normalizeNamed(row.personas, "persona"),
    scenarios: normalizeNamed(row.scenarios, "scenario"),
    sellingPoints: normalizePoint(row.sellingPoints),
    painPoints: normalizePoint(row.painPoints),
    dimensionInsights: list(row.dimensionInsights).slice(0, 22).map((item) => {
      const entry = object(item);
      const confidence = textValue(entry.confidence, "low");
      return {
        dimension: textValue(entry.dimension, "未命名维度").slice(0, 80),
        finding: textValue(entry.finding, "样本未充分提及").slice(0, 800),
        confidence: (allowedConfidence.has(confidence) ? confidence : "low") as "high" | "medium" | "low",
        evidence: textValue(entry.evidence, "未提供证据").slice(0, 800),
      };
    }),
    opportunities: list(row.opportunities).slice(0, 8).map((item) => {
      const entry = object(item);
      return {
        title: textValue(entry.title, "未命名机会").slice(0, 160),
        rationale: textValue(entry.rationale, "").slice(0, 1000),
        audience: textValue(entry.audience, "目标用户未明确").slice(0, 300),
      };
    }),
    actions: list(row.actions).slice(0, 10).map((item) => {
      const entry = object(item);
      const priority = textValue(entry.priority, "P2");
      return {
        priority: (allowedPriority.has(priority) ? priority : "P2") as "P0" | "P1" | "P2",
        title: textValue(entry.title, "未命名行动").slice(0, 160),
        details: textValue(entry.details, "").slice(0, 1200),
        evidence: textValue(entry.evidence, "").slice(0, 800),
      };
    }),
    representativeQuotes: list(row.representativeQuotes).slice(0, 12).map((item) => {
      const entry = object(item);
      return {
        reviewId: textValue(entry.reviewId, "unknown").slice(0, 120),
        rating: Math.max(1, Math.min(5, Math.round(numberValue(entry.rating, 3)))),
        quote: textValue(entry.quote, "").slice(0, 800),
        insight: textValue(entry.insight, "").slice(0, 600),
      };
    }),
  };
}

function parseModelJson(content: string) {
  const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有返回可解析的评论分析 JSON");
  const candidate = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    // Some OpenAI-compatible models occasionally emit smart quotes or other
    // near-JSON syntax even in JSON mode. Repair only after strict parsing fails.
    return JSON.parse(jsonrepair(candidate)) as unknown;
  }
}

function ratingBreakdown(reviews: ReviewRow[]) {
  return [1, 2, 3, 4, 5].map((rating) => {
    const count = reviews.filter((review) => Math.round(review.rating) === rating).length;
    return { rating, count, pct: reviews.length ? Math.round((count / reviews.length) * 1000) / 10 : 0 };
  });
}

function reviewPayload(reviews: ReviewRow[]) {
  return reviews.map((review) => ({
    review_id: review.reviewId,
    rating: review.rating,
    title: review.title,
    body: review.reviewContent,
    date: review.reviewDate,
    verified_purchase: Boolean(review.verifiedPurchase),
    helpful_votes: review.helpfulVotes,
    variant: review.productVariant,
    has_media: review.imagesJson !== "[]",
  }));
}

function analysisPrompt(asin: string, marketplace: string, reviews: ReviewRow[], ratings: ReviewAnalysisResult["ratingBreakdown"]) {
  return `你是拥有15年经验的消费者行为学家和跨境电商评论分析师。请严格采用 Review Analyzer Skill V2.0 的22维标签体系和数据诚实原则，对下列 Amazon 评论做聚合深度分析。

分析对象：ASIN ${asin}，站点 ${marketplace}，评论 ${reviews.length} 条。
确定性星级统计：${JSON.stringify(ratings)}
22个分析维度：${DIMENSIONS.join("、")}

要求：
1. 输出中文；只返回一个合法 JSON 对象，不要 Markdown 或解释文字。
2. 无依据不推断；某维度有效信息不足40%时 confidence 必须为 low，并明确写“数据不足”。人口属性均注明为 AI 语义侧写推断。
3. 每个卖点、痛点和重要结论必须给出样本占比或提及次数，并引用输入中真实存在的短句，不得编造评论。
4. 情感判断以正文为主、星级为辅；positivePct + neutralPct + negativePct 必须等于100。
5. dimensionInsights 尽量覆盖全部22个维度；缺乏信息的维度也要保留并说明数据不足。
6. 行动建议使用 P0/P1/P2，必须可执行且能追溯到评论证据。

JSON结构：
{
  "executiveSummary":"核心结论",
  "dataQuality":"样本质量与限制",
  "sentiment":{"positivePct":0,"neutralPct":0,"negativePct":0,"conclusion":"情感解读"},
  "personas":[{"name":"人群","share":"占比或提及数","evidence":"证据"}],
  "scenarios":[{"name":"场景","share":"占比或提及数","evidence":"证据"}],
  "sellingPoints":[{"title":"卖点","share":"占比或提及数","evidence":"逻辑与证据","quote":"原文短句"}],
  "painPoints":[{"title":"痛点","share":"占比或提及数","evidence":"逻辑与证据","quote":"原文短句"}],
  "dimensionInsights":[{"dimension":"22维之一","finding":"发现","confidence":"high|medium|low","evidence":"数据证据"}],
  "opportunities":[{"title":"机会点","rationale":"原因与价值","audience":"目标人群"}],
  "actions":[{"priority":"P0|P1|P2","title":"行动项","details":"具体执行方法","evidence":"来源证据"}],
  "representativeQuotes":[{"reviewId":"评论ID","rating":1,"quote":"原文短句","insight":"说明"}]
}

评论数据：${JSON.stringify(reviewPayload(reviews))}`;
}

export async function getReviewAnalysis(taskId: string, userId: string) {
  await ensureSchema();
  const row = await d1()
    .prepare(`SELECT status,model_name modelName,review_count reviewCount,result_json resultJson,error,created_at createdAt,updated_at updatedAt,completed_at completedAt FROM review_analyses WHERE task_id=? AND user_id=?`)
    .bind(taskId, userId)
    .first<Record<string, unknown>>();
  if (!row) return null;
  return {
    status: row.status,
    modelName: row.modelName,
    reviewCount: row.reviewCount,
    result: row.resultJson ? JSON.parse(String(row.resultJson)) as ReviewAnalysisResult : null,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
  };
}

export async function runReviewAnalysis(taskId: string, userId: string) {
  await ensureSchema();
  const task = await d1()
    .prepare(`SELECT id,asin,marketplace,status,review_count reviewCount FROM review_tasks WHERE id=? AND user_id=?`)
    .bind(taskId, userId)
    .first<{ id: string; asin: string; marketplace: string; status: string; reviewCount: number }>();
  if (!task) throw new Error("评论任务不存在");
  if (!String(task.status).startsWith("done")) throw new Error("评论获取完成后才能进行分析");

  const reviewsResult = await d1()
    .prepare(`SELECT review_id reviewId,rating,title,review_content reviewContent,review_date reviewDate,verified_purchase verifiedPurchase,helpful_votes helpfulVotes,product_variant productVariant,images_json imagesJson FROM review_items WHERE task_id=? ORDER BY rating ASC,review_date DESC LIMIT 100`)
    .bind(taskId)
    .all<ReviewRow>();
  const reviews = reviewsResult.results.filter((review) => review.reviewContent || review.title);
  if (!reviews.length) throw new Error("该任务没有可分析的评论数据");

  const existing = await getReviewAnalysis(taskId, userId);
  if (existing?.status === "COMPLETED" && existing.reviewCount === reviews.length) return existing;
  if (existing?.status === "RUNNING") throw new Error("该任务正在分析中，请稍候");

  const config = await modelConfigForUser(userId);
  const id = crypto.randomUUID();
  const now = Date.now();
  await d1()
    .prepare(`INSERT INTO review_analyses(id,task_id,user_id,status,model_name,review_count,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(task_id) DO UPDATE SET status='RUNNING',model_name=excluded.model_name,review_count=excluded.review_count,result_json=NULL,raw_response=NULL,error=NULL,updated_at=excluded.updated_at,completed_at=NULL`)
    .bind(id, taskId, userId, "RUNNING", config.modelName, reviews.length, now, now)
    .run();

  const ratings = ratingBreakdown(reviews);
  const prompt = analysisPrompt(task.asin, task.marketplace, reviews, ratings);
  const requestBody = {
    model: config.modelName,
    messages: [
      { role: "system", content: "你是专业的 Amazon VOC 评论分析师。严格基于输入数据，输出结构化 JSON。" },
      { role: "user", content: prompt },
    ],
    stream: false,
    temperature: 0.1,
    max_tokens: 8000,
    response_format: { type: "json_object" },
  };

  try {
    const response = await fetch(modelEndpoint(config), {
      method: "POST",
      headers: modelHeaders(config),
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) throw new Error(`评论分析模型调用失败 (${response.status}): ${(await response.text()).slice(0, 240)}`);
    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string | null; reasoning_content?: string | null } }>;
      usage?: ProviderUsage;
    };
    const message = data.choices?.[0]?.message;
    const content = message?.content || message?.reasoning_content || "";
    await recordTokenUsage({
      userId,
      modelName: config.modelName,
      modelSource: config.source,
      operation: "review.analysis",
      usage: data.usage,
      request: requestBody,
      response: content,
    });
    const result = normalizeAnalysis(parseModelJson(content), reviews.length, ratings);
    await d1()
      .prepare(`UPDATE review_analyses SET status='COMPLETED',result_json=?,raw_response=?,error=NULL,updated_at=?,completed_at=? WHERE task_id=? AND user_id=?`)
      .bind(JSON.stringify(result), content.slice(0, 120000), Date.now(), Date.now(), taskId, userId)
      .run();
    return await getReviewAnalysis(taskId, userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "评论分析失败";
    await d1()
      .prepare(`UPDATE review_analyses SET status='FAILED',error=?,updated_at=?,completed_at=? WHERE task_id=? AND user_id=?`)
      .bind(message.slice(0, 1500), Date.now(), Date.now(), taskId, userId)
      .run();
    throw error;
  }
}
