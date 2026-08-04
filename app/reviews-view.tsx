"use client";

import { useEffect, useState } from "react";

type ReviewTask = {
  id: string;
  asin: string;
  marketplace: string;
  pages: number;
  starMode: string;
  stars: string[];
  sortBy: string;
  reviewerType: string;
  mediaType: string;
  status: string;
  reviewCount: number;
  error?: string | null;
  createdAt: number;
  completedAt?: number | null;
};

type ReviewItem = {
  reviewId: string;
  userName: string;
  rating: number;
  title: string;
  reviewDate: string;
  reviewContent: string;
  verifiedPurchase: number;
  helpfulVotes: number;
  productVariant: string;
};

type ReviewAnalysis = {
  status: string;
  modelName?: string | null;
  reviewCount: number;
  error?: string | null;
  completedAt?: number | null;
  result?: {
    executiveSummary: string;
    sampleSize: number;
    dataQuality: string;
    sentiment: { positivePct: number; neutralPct: number; negativePct: number; conclusion: string };
    ratingBreakdown: Array<{ rating: number; count: number; pct: number }>;
    personas: Array<{ name: string; share: string; evidence: string }>;
    scenarios: Array<{ name: string; share: string; evidence: string }>;
    sellingPoints: Array<{ title: string; share: string; evidence: string; quote: string }>;
    painPoints: Array<{ title: string; share: string; evidence: string; quote: string }>;
    dimensionInsights: Array<{ dimension: string; finding: string; confidence: string; evidence: string }>;
    opportunities: Array<{ title: string; rationale: string; audience: string }>;
    actions: Array<{ priority: string; title: string; details: string; evidence: string }>;
    representativeQuotes: Array<{ reviewId: string; rating: number; quote: string; insight: string }>;
  } | null;
};

const starLabels: Record<string, string> = {
  one_star: "1 星",
  two_star: "2 星",
  three_star: "3 星",
  four_star: "4 星",
  five_star: "5 星",
  critical: "差评 1–3 星",
  positive: "好评 4–5 星",
  all_stars: "全部 1–5 星",
};

const statusLabels: Record<string, string> = {
  submitting: "正在提交",
  processing: "获取中",
  done: "已完成",
  done_with_errors: "部分完成",
  failed: "失败",
};

export function ReviewsView({
  notify,
}: {
  notify: (title: string, detail: string) => void;
}) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<ReviewTask | null>(null);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [starMode, setStarMode] = useState("all_stars");
  const [analyzingTaskId, setAnalyzingTaskId] = useState<string | null>(null);
  const [analysisTask, setAnalysisTask] = useState<ReviewTask | null>(null);
  const [analysis, setAnalysis] = useState<ReviewAnalysis | null>(null);

  async function loadConfig() {
    const response = await fetch("/api/reviews/config");
    const data = await response.json();
    if (response.ok) setConfigured(Boolean(data.configured));
    else notify("读取配置失败", data.error || "无法读取评论功能状态");
  }

  async function loadTasks() {
    const response = await fetch("/api/reviews/tasks");
    const data = await response.json();
    if (response.ok) setTasks(data.tasks || []);
    else notify("读取记录失败", data.error || "无法读取历史评论任务");
  }

  async function refreshTask(id: string, showDetails = false) {
    const response = await fetch(`/api/reviews/tasks/${encodeURIComponent(id)}`);
    const data = await response.json();
    if (!response.ok) {
      if (showDetails) notify("读取任务失败", data.error || "无法读取评论任务");
      return;
    }
    const task = data.task as ReviewTask;
    setTasks((current) =>
      current.map((item) => (item.id === task.id ? { ...item, ...task } : item)),
    );
    setSelectedTask((current) =>
      current?.id === task.id || showDetails ? task : current,
    );
    if (showDetails || selectedTask?.id === task.id) setReviews(data.reviews || []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void Promise.all([loadConfig(), loadTasks()]).finally(() => setLoading(false));
    // The review workspace loads its initial server state once when mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const active = tasks
      .filter((task) => ["submitting", "processing"].includes(task.status))
      .slice(0, 5);
    if (!active.length) return;
    const timer = window.setInterval(() => {
      for (const task of active) void refreshTask(task.id);
    }, 7000);
    return () => window.clearInterval(timer);
    // Polling is rebuilt only when the task snapshot changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured) return;
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/reviews/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        asin: form.get("asin"),
        marketplace: form.get("marketplace"),
        pages: Number(form.get("pages")),
        starMode,
        sortBy: form.get("sortBy"),
        reviewerType: form.get("reviewerType"),
        mediaType: form.get("mediaType"),
        variant: form.get("variant"),
      }),
    });
    const data = await response.json();
    setSubmitting(false);
    await loadTasks();
    if (!response.ok) {
      notify("提交失败", data.error || "评论任务提交失败");
      return;
    }
    notify(
      "评论任务已提交",
      data.warning
        ? `部分星级提交异常：${data.warning}`
        : `已创建 ${data.upstreamTaskCount} 个星级任务，结果会自动合并。`,
    );
    await refreshTask(data.taskId, true);
  }

  async function analyzeReviews(task: ReviewTask) {
    setAnalyzingTaskId(task.id);
    setAnalysisTask(task);
    const response = await fetch(`/api/reviews/tasks/${encodeURIComponent(task.id)}/analysis`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    const data = await response.json();
    setAnalyzingTaskId(null);
    if (!response.ok) {
      notify("评论分析失败", data.error || "无法完成评论分析");
      return;
    }
    setAnalysis(data.analysis || null);
    notify("评论分析已完成", `已分析 ${data.analysis?.reviewCount || task.reviewCount} 条评论。`);
  }

  return (
    <main className="reviews-page">
      <section className="reviews-hero">
        <div>
          <p className="eyebrow">
            <span /> AMAZON REVIEW COLLECTOR
          </p>
          <h1>获取评论</h1>
          <p>按站点与筛选条件抓取 Amazon 评论，并将多星级请求合并为一个可下载任务。</p>
        </div>
        <div className={`review-key-status ${configured ? "ready" : "missing"}`}>
          <span>{configured ? "✓" : "!"}</span>
          <div>
            <strong>{configured ? "评论 API 已配置" : "评论 API 未配置"}</strong>
            <small>
              {configured
                ? "功能可正常使用，密钥由管理员加密维护"
                : "请联系管理员在网站模型管理中配置 API Key"}
            </small>
          </div>
        </div>
      </section>

      <section className="review-card review-builder-card">
        <div className="review-card-heading">
          <div>
            <strong>新建获取任务</strong>
            <span>每个星级按所填页数单独请求，快捷筛选会自动合并结果</span>
          </div>
          <em>1 页 / 星级</em>
        </div>
        <form className="review-form" onSubmit={submit}>
          <label className="wide">
            ASIN
            <input
              name="asin"
              placeholder="例如 B08N5KWB9H"
              maxLength={10}
              pattern="[A-Za-z0-9]{10}"
              disabled={!configured || submitting}
              required
            />
          </label>
          <label>
            站点
            <select name="marketplace" defaultValue="US" disabled={!configured || submitting}>
              <option value="US">美国 · US</option>
              <option value="CA">加拿大 · CA</option>
              <option value="MX">墨西哥 · MX</option>
              <option value="UK">英国 · UK</option>
              <option value="DE">德国 · DE</option>
              <option value="FR">法国 · FR</option>
              <option value="IT">意大利 · IT</option>
              <option value="ES">西班牙 · ES</option>
              <option value="JP">日本 · JP</option>
              <option value="AU">澳大利亚 · AU</option>
              <option value="IN">印度 · IN</option>
              <option value="AE">阿联酋 · AE</option>
            </select>
          </label>
          <label>
            抓取页数
            <input
              name="pages"
              type="number"
              min={1}
              max={10}
              defaultValue={1}
              disabled={!configured || submitting}
              required
            />
          </label>

          <fieldset className="review-star-fieldset wide-row">
            <legend>星级筛选</legend>
            <div className="review-quick-filters">
              {[
                ["critical", "差评获取 1–3 星"],
                ["positive", "好评获取 4–5 星"],
                ["all_stars", "全部获取 1–5 星"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={starMode === value ? "active" : ""}
                  onClick={() => setStarMode(value)}
                  disabled={!configured || submitting}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="review-single-stars">
              <span>或仅获取：</span>
              {[1, 2, 3, 4, 5].map((star) => {
                const value = `${["one", "two", "three", "four", "five"][star - 1]}_star`;
                return (
                  <button
                    key={value}
                    type="button"
                    className={starMode === value ? "active" : ""}
                    onClick={() => setStarMode(value)}
                    disabled={!configured || submitting}
                  >
                    {star} 星
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label>
            排序方式
            <select name="sortBy" defaultValue="recent" disabled={!configured || submitting}>
              <option value="recent">最新发布</option>
              <option value="helpful">最有帮助</option>
            </select>
          </label>
          <label>
            评论类型
            <select name="reviewerType" defaultValue="all_reviews" disabled={!configured || submitting}>
              <option value="all_reviews">全部评论</option>
              <option value="avp_only_reviews">仅已验证购买</option>
            </select>
          </label>
          <label>
            媒体类型
            <select name="mediaType" defaultValue="all_contents" disabled={!configured || submitting}>
              <option value="all_contents">全部内容</option>
              <option value="media_reviews_only">仅图片 / 视频评论</option>
            </select>
          </label>
          <label>
            商品规格
            <select name="variant" defaultValue="all_formats" disabled={!configured || submitting}>
              <option value="all_formats">全部规格</option>
              <option value="current_format">仅当前规格</option>
            </select>
          </label>
          <div className="review-submit-row wide-row">
            <span>当前筛选：{starLabels[starMode]}</span>
            <button className="primary" type="submit" disabled={!configured || submitting}>
              {submitting ? "正在创建任务…" : "开始获取评论 →"}
            </button>
          </div>
        </form>
      </section>

      <section className="review-card review-history-card">
        <div className="review-card-heading">
          <div>
            <strong>历史获取记录</strong>
            <span>查看任务状态、评论数量并下载 CSV 文件</span>
          </div>
          <em>{tasks.length} 个任务</em>
        </div>
        {loading ? (
          <div className="review-empty">正在读取历史记录…</div>
        ) : tasks.length ? (
          <div className="review-history-table-wrap">
            <table className="review-history-table">
              <thead>
                <tr>
                  <th>ASIN / 站点</th>
                  <th>筛选</th>
                  <th>页数</th>
                  <th>评论数</th>
                  <th>状态</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <strong>{task.asin}</strong>
                      <small>{task.marketplace}</small>
                    </td>
                    <td>{starLabels[task.starMode] || task.starMode}</td>
                    <td>{task.pages} 页 / 星级</td>
                    <td>{task.reviewCount || 0}</td>
                    <td>
                      <span className={`review-status ${task.status}`}>
                        {statusLabels[task.status] || task.status}
                      </span>
                    </td>
                    <td>{new Date(task.createdAt).toLocaleString("zh-CN")}</td>
                    <td className="review-row-actions">
                      <button type="button" onClick={() => void refreshTask(task.id, true)}>
                        查看
                      </button>
                      {task.status.startsWith("done") && (
                        <a href={`/api/reviews/tasks/${task.id}/download`}>下载 CSV</a>
                      )}
                      {task.status.startsWith("done") && task.reviewCount > 0 && (
                        <button
                          type="button"
                          className="review-analyze-button"
                          disabled={analyzingTaskId !== null}
                          onClick={() => void analyzeReviews(task)}
                        >
                          {analyzingTaskId === task.id ? "分析中…" : "分析评论"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="review-empty">还没有获取记录，提交第一个 ASIN 开始使用。</div>
        )}
      </section>

      {analysisTask && (
        <section className="review-card review-analysis-card">
          <div className="review-card-heading">
            <div>
              <strong>{analysisTask.asin} · 评论分析</strong>
              <span>
                Review Analyzer Skill V2.0 · {analysis?.reviewCount || analysisTask.reviewCount} 条评论
                {analysis?.modelName ? ` · ${analysis.modelName}` : ""}
              </span>
            </div>
            <button type="button" onClick={() => { setAnalysisTask(null); setAnalysis(null); }}>关闭</button>
          </div>
          {analyzingTaskId === analysisTask.id ? (
            <div className="review-analysis-loading">
              <span />
              <strong>正在进行 22 维评论分析…</strong>
              <small>正在提取用户画像、使用场景、卖点、痛点和行动建议，请稍候。</small>
            </div>
          ) : analysis?.result ? (
            <div className="review-analysis-content">
              <div className="review-analysis-summary">
                <div>
                  <span>核心洞察</span>
                  <h3>{analysis.result.executiveSummary}</h3>
                  <p>{analysis.result.dataQuality}</p>
                </div>
                <div className="review-sentiment-grid">
                  <div className="positive"><b>{analysis.result.sentiment.positivePct}%</b><span>正向</span></div>
                  <div className="neutral"><b>{analysis.result.sentiment.neutralPct}%</b><span>中立</span></div>
                  <div className="negative"><b>{analysis.result.sentiment.negativePct}%</b><span>负向</span></div>
                </div>
              </div>

              <div className="review-analysis-columns">
                <AnalysisList title="核心卖点" tone="positive" items={analysis.result.sellingPoints.map((item) => ({ title: item.title, meta: item.share, body: item.evidence, quote: item.quote }))} />
                <AnalysisList title="核心痛点" tone="negative" items={analysis.result.painPoints.map((item) => ({ title: item.title, meta: item.share, body: item.evidence, quote: item.quote }))} />
              </div>

              <div className="review-analysis-columns">
                <AnalysisList title="用户画像" items={analysis.result.personas.map((item) => ({ title: item.name, meta: item.share, body: item.evidence }))} />
                <AnalysisList title="使用场景" items={analysis.result.scenarios.map((item) => ({ title: item.name, meta: item.share, body: item.evidence }))} />
              </div>

              <div className="review-analysis-section">
                <div className="review-analysis-title"><strong>22 维洞察</strong><span>低置信度维度会明确标记数据不足</span></div>
                <div className="review-dimension-grid">
                  {analysis.result.dimensionInsights.map((item) => (
                    <article key={item.dimension}>
                      <div><strong>{item.dimension}</strong><em className={item.confidence}>{item.confidence}</em></div>
                      <p>{item.finding}</p>
                      <small>{item.evidence}</small>
                    </article>
                  ))}
                </div>
              </div>

              <div className="review-analysis-section">
                <div className="review-analysis-title"><strong>行动优先级</strong><span>基于评论证据的可执行建议</span></div>
                <div className="review-action-list">
                  {analysis.result.actions.map((item) => (
                    <article key={`${item.priority}-${item.title}`}>
                      <b className={item.priority.toLowerCase()}>{item.priority}</b>
                      <div><strong>{item.title}</strong><p>{item.details}</p><small>{item.evidence}</small></div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="review-analysis-section">
                <div className="review-analysis-title"><strong>市场机会</strong><span>产品与营销方向</span></div>
                <div className="review-opportunity-grid">
                  {analysis.result.opportunities.map((item) => (
                    <article key={item.title}><strong>{item.title}</strong><p>{item.rationale}</p><small>目标人群：{item.audience}</small></article>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="review-empty">评论分析暂未生成。</div>
          )}
        </section>
      )}

      {selectedTask && (
        <section className="review-card review-results-card">
          <div className="review-card-heading">
            <div>
              <strong>{selectedTask.asin} · 评论预览</strong>
              <span>
                {starLabels[selectedTask.starMode]} · 已保存 {selectedTask.reviewCount || 0} 条
              </span>
            </div>
            <div className="review-result-actions">
              {selectedTask.status.startsWith("done") && (
                <a href={`/api/reviews/tasks/${selectedTask.id}/download`}>下载完整 CSV</a>
              )}
              <button type="button" onClick={() => setSelectedTask(null)}>关闭</button>
            </div>
          </div>
          {selectedTask.error && <div className="review-warning">{selectedTask.error}</div>}
          {reviews.length ? (
            <div className="review-preview-list">
              {reviews.map((review) => (
                <article key={review.reviewId}>
                  <div className="review-stars">{"★".repeat(Math.max(0, review.rating))}</div>
                  <div>
                    <strong>{review.title || "无标题评论"}</strong>
                    <span>
                      {review.userName || "匿名用户"} · {review.reviewDate || "日期未知"}
                      {review.verifiedPurchase ? " · 已验证购买" : ""}
                    </span>
                    <p>{review.reviewContent || "（无评论正文）"}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="review-empty">
              {selectedTask.status === "processing" ? "评论正在获取中，请稍候…" : "该任务暂无评论数据。"}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function AnalysisList({
  title,
  tone = "default",
  items,
}: {
  title: string;
  tone?: "default" | "positive" | "negative";
  items: Array<{ title: string; meta?: string; body: string; quote?: string }>;
}) {
  return (
    <div className={`review-analysis-list ${tone}`}>
      <h4>{title}</h4>
      {items.map((item) => (
        <article key={`${item.title}-${item.meta || ""}`}>
          <div><strong>{item.title}</strong>{item.meta && <span>{item.meta}</span>}</div>
          <p>{item.body}</p>
          {item.quote && <blockquote>“{item.quote}”</blockquote>}
        </article>
      ))}
    </div>
  );
}
