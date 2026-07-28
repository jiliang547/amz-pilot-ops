import { accountCredentials } from "./accounts";
import { AmazonAdsApiClient, executeDirectCampaignReport } from "./amazon-ads-api";
import type { AmazonCredentials } from "./amazon-mcp";
import { d1 } from "./db";

type WindowKey = "1d" | "7d" | "30d" | "90d";
type Metrics = Record<string, number>;
type Group = { campaignId?: string; campaignName?: string; aggregates: Metrics };
type SnapshotPayload = { aggregates: Metrics; groups: Group[]; rowCount: number };

const WINDOWS: Array<{ key: WindowKey; days: number; label: string }> = [
  { key: "1d", days: 1, label: "昨天" },
  { key: "7d", days: 7, label: "近 7 个完整自然日" },
  { key: "30d", days: 30, label: "近 30 个完整自然日" },
  { key: "90d", days: 90, label: "近 90 个完整自然日" },
];

function localParts(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? "";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, hour: Number(value("hour")), minute: Number(value("minute")) };
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function runSnapshot(
  row: Record<string, unknown>,
  credentials: AmazonCredentials,
  key: WindowKey,
  days: number,
  snapshotDate: string,
  force = false,
  onStatus?: (text: string) => void,
  sharedClient?: AmazonAdsApiClient,
  timeoutMs = 60 * 60_000,
) {
  const window = WINDOWS.find(item => item.key === key)!;
  const endDate = shiftDate(snapshotDate, -1), startDate = shiftDate(endDate, -(days - 1)), now = Date.now();
  const existing = await d1().prepare(`SELECT id,status,attempts,updated_at updatedAt FROM report_snapshots WHERE account_id=? AND report_type='campaign' AND window_key=? AND snapshot_date=?`).bind(row.id, key, snapshotDate).first<{ id: string; status: string; attempts: number; updatedAt: number }>();
  const runningFresh = existing?.status === "RUNNING" && now - existing.updatedAt < 65 * 60_000;
  if (existing?.status === "COMPLETED") return { windowKey: key, status: "COMPLETED" };
  if (runningFresh) return { windowKey: key, status: "RUNNING" };
  if (!force && existing?.status === "FAILED" && (existing.attempts >= 3 || now - existing.updatedAt < 15 * 60_000)) return { windowKey: key, status: "FAILED" };
  const id = existing?.id ?? crypto.randomUUID();
  if (!existing) {
    await d1().prepare(`INSERT INTO report_snapshots(id,user_id,account_id,report_type,window_key,snapshot_date,start_date,end_date,status,attempts,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, row.user_id, row.id, "campaign", key, snapshotDate, startDate, endDate, "RUNNING", 1, now, now).run();
  } else {
    await d1().prepare(`UPDATE report_snapshots SET status='RUNNING',error=NULL,attempts=attempts+1,updated_at=? WHERE id=?`).bind(now, id).run();
  }
  try {
    onStatus?.(`${window.label}：正在创建 Amazon Ads API v3 报表`);
    const result = await executeDirectCampaignReport(sharedClient ?? new AmazonAdsApiClient(credentials), startDate, endDate, {
      userId: String(row.user_id), accountId: String(row.id), timeoutMs,
      onStatus: text => onStatus?.(`${window.label}：${text}`),
    });
    const payload = result.summary;
    const reportId = result.reportId;
    await d1().prepare(`UPDATE report_snapshots SET status='COMPLETED',report_id=?,metrics_json=?,error=NULL,completed_at=?,updated_at=? WHERE id=?`).bind(reportId || null, JSON.stringify(payload), Date.now(), Date.now(), id).run();
    onStatus?.(`${window.label}：报表已保存并完成后端汇总`);
    return { windowKey: key, status: "COMPLETED" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await d1().prepare(`UPDATE report_snapshots SET status='FAILED',error=?,updated_at=? WHERE id=?`).bind(message.slice(0, 1000), Date.now(), id).run();
    onStatus?.(`${window.label}：生成失败——${message}`);
    return { windowKey: key, status: "FAILED", error: message };
  }
}

export async function runDailyReportSnapshots(): Promise<number> {
  const accounts = await d1().prepare(`SELECT id,user_id,name,region,marketplace,timezone,currency,profile_id,advertiser_account_id FROM accounts ORDER BY updated_at`).all<Record<string, unknown>>();
  for (const row of accounts.results) {
    const timezone = String(row.timezone ?? "UTC");
    const local = localParts(timezone);
    if (local.hour === 0 && local.minute < 15) continue;
    for (const window of WINDOWS) {
      const existing = await d1().prepare(`SELECT status,attempts,updated_at updatedAt FROM report_snapshots WHERE account_id=? AND report_type='campaign' AND window_key=? AND snapshot_date=?`).bind(row.id, window.key, local.date).first<{ status: string; attempts: number; updatedAt: number }>();
      const runningFresh = existing?.status === "RUNNING" && Date.now() - existing.updatedAt < 65 * 60_000;
      if (existing?.status === "COMPLETED" || runningFresh || (existing?.status === "FAILED" && (existing.attempts >= 3 || Date.now() - existing.updatedAt < 15 * 60_000))) continue;
      const { credentials } = await accountCredentials(String(row.user_id), String(row.id));
      const result = await runSnapshot(row, credentials, window.key, window.days, local.date);
      return result.status === "COMPLETED" ? 1 : 0;
    }
  }
  return 0;
}

export async function runManualReportSnapshots(userId: string, accountId: string, onStatus?: (text: string) => void) {
  const row = await d1().prepare(`SELECT id,user_id,name,region,marketplace,timezone,currency,profile_id,advertiser_account_id FROM accounts WHERE id=? AND user_id=?`).bind(accountId, userId).first<Record<string, unknown>>();
  if (!row) throw new Error("店铺不存在");
  const snapshotDate = localParts(String(row.timezone ?? "UTC")).date;
  const { credentials } = await accountCredentials(userId, accountId);
  const client = new AmazonAdsApiClient(credentials);
  const deadline = Date.now() + 60 * 60_000;
  const windows: Array<{ windowKey: WindowKey; status: string; error?: string }> = [];
  onStatus?.("已启动四个时间窗口的 Amazon Ads API v3 报表；后端会按顺序创建、轮询、下载和汇总，整体最长等待 1 小时");
  for (const window of WINDOWS) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      windows.push({ windowKey: window.key, status: "FAILED", error: "四个报表的整体等待时间已达到 1 小时" });
      onStatus?.(`${window.label}：整体等待时间已达到 1 小时，本次未继续创建`);
      continue;
    }
    windows.push(await runSnapshot(row, credentials, window.key, window.days, snapshotDate, true, onStatus, client, remainingMs));
  }
  return { snapshotDate, windows };
}

function requestedWindow(message: string): WindowKey | null {
  if (/昨天|昨日|yesterday/i.test(message)) return "1d";
  if (/近\s*7\s*天|最近\s*7\s*天|过去\s*7\s*天|last\s*7/i.test(message)) return "7d";
  if (/近\s*30\s*天|最近\s*30\s*天|过去\s*30\s*天|last\s*30/i.test(message)) return "30d";
  if (/近\s*90\s*天|最近\s*90\s*天|过去\s*90\s*天|last\s*90/i.test(message)) return "90d";
  return null;
}

function format(value: number, digits = 2) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(value);
}

function metricFor(message: string): { key: string; label: string; derived?: (a: Metrics) => number } {
  if (/roas|广告投入产出/i.test(message)) return { key: "roas", label: "ROAS", derived: a => a.totalCost ? (a.sales ?? 0) / a.totalCost : 0 };
  if (/acos/i.test(message)) return { key: "acos", label: "ACOS", derived: a => a.sales ? (a.totalCost ?? 0) / a.sales * 100 : 0 };
  if (/点击率|ctr/i.test(message)) return { key: "ctr", label: "CTR", derived: a => a.impressions ? (a.clicks ?? 0) / a.impressions * 100 : 0 };
  if (/销售额|销售|sales/i.test(message)) return { key: "sales", label: "销售额" };
  if (/点击|click/i.test(message)) return { key: "clicks", label: "点击量" };
  if (/曝光|展示|impression/i.test(message)) return { key: "impressions", label: "曝光量" };
  if (/订单|购买|purchase/i.test(message)) return { key: "purchases", label: "订单量" };
  return { key: "totalCost", label: "花费" };
}

export async function trySavedSnapshotQuery(options: { userId: string; accountId: string; message: string; row: Record<string, unknown> }) {
  const windowKey = requestedWindow(options.message);
  if (!windowKey || !/查|查询|多少|总额|总计|汇总|统计|最高|最低|最多|最少|排名|排行|表现|数据|report/i.test(options.message)) return null;
  const expectedEndDate = shiftDate(localParts(String(options.row.timezone ?? "UTC")).date, -1);
  const snapshot = await d1().prepare(`SELECT window_key windowKey,start_date startDate,end_date endDate,metrics_json metricsJson,completed_at completedAt FROM report_snapshots WHERE user_id=? AND account_id=? AND report_type='campaign' AND window_key=? AND end_date=? AND status='COMPLETED' ORDER BY snapshot_date DESC LIMIT 1`).bind(options.userId, options.accountId, windowKey, expectedEndDate).first<{ windowKey: WindowKey; startDate: string; endDate: string; metricsJson: string; completedAt: number }>();
  if (!snapshot) return null;
  const payload = JSON.parse(snapshot.metricsJson) as SnapshotPayload;
  const metric = metricFor(options.message), valueFor = (aggregates: Metrics) => metric.derived ? metric.derived(aggregates) : Number(aggregates[metric.key] ?? 0);
  const descending = !/最低|最少/i.test(options.message), ranking = /最高|最低|最多|最少|排名|排行|哪个|哪一个/i.test(options.message);
  const currency = String(options.row.currency ?? "USD").toUpperCase(), percentage = ["acos", "ctr"].includes(metric.key);
  let content: string;
  if (ranking) {
    const ranked = payload.groups.map(group => ({ group, value: valueFor(group.aggregates) })).sort((a, b) => descending ? b.value - a.value : a.value - b.value);
    if (!ranked.length) return null;
    const top = ranked.slice(0, 5).map((item, index) => `${index + 1}. ${item.group.campaignName || "未命名 Campaign"}（ID ${item.group.campaignId || "未知"}）：${format(item.value)}${percentage ? "%" : ["totalCost", "sales"].includes(metric.key) ? ` ${currency}` : ""}`).join("\n");
    content = `${descending ? "最高" : "最低"}${metric.label}的广告活动是：${ranked[0].group.campaignName || "未命名 Campaign"}\n\n前 5 名：\n${top}`;
  } else {
    const value = valueFor(payload.aggregates);
    content = `${metric.label}：${format(value)}${percentage ? "%" : ["totalCost", "sales"].includes(metric.key) ? ` ${currency}` : ""}\n数据行：${payload.rowCount}`;
  }
  const label = WINDOWS.find(item => item.key === windowKey)?.label ?? windowKey;
  return { type: "answer" as const, content: `已直接读取后端夜间快照，没有调用大模型或重新请求 Amazon 报表。\n\n日期：${label}（${snapshot.startDate} 至 ${snapshot.endDate}）\n${content}`, accountId: options.accountId, modelRounds: 0, snapshotPath: true };
}

export async function dashboardData(userId: string, accountId: string) {
  const rows = await d1().prepare(`SELECT s.window_key windowKey,s.start_date startDate,s.end_date endDate,s.status,s.error,s.metrics_json metricsJson,s.completed_at completedAt,s.updated_at updatedAt FROM report_snapshots s WHERE s.user_id=? AND s.account_id=? AND s.report_type='campaign' AND s.snapshot_date=(SELECT MAX(s2.snapshot_date) FROM report_snapshots s2 WHERE s2.user_id=s.user_id AND s2.account_id=s.account_id AND s2.report_type=s.report_type AND s2.window_key=s.window_key) ORDER BY CASE s.window_key WHEN '1d' THEN 1 WHEN '7d' THEN 2 WHEN '30d' THEN 3 ELSE 4 END`).bind(userId, accountId).all<Record<string, unknown>>();
  const windows = rows.results.map(row => {
    const payload = row.metricsJson ? JSON.parse(String(row.metricsJson)) as SnapshotPayload : null;
    const a = payload?.aggregates ?? {};
    const metrics: Metrics = { ...a, roas: a.totalCost ? (a.sales ?? 0) / a.totalCost : 0, acos: a.sales ? (a.totalCost ?? 0) / a.sales * 100 : 0, ctr: a.impressions ? (a.clicks ?? 0) / a.impressions * 100 : 0 };
    return { windowKey: row.windowKey, startDate: row.startDate, endDate: row.endDate, status: row.status, error: row.error, completedAt: row.completedAt, rowCount: payload?.rowCount ?? 0, metrics, topCampaigns: [...(payload?.groups ?? [])].sort((x, y) => (y.aggregates.totalCost ?? 0) - (x.aggregates.totalCost ?? 0)).slice(0, 5) };
  });
  const one = windows.find(item => item.windowKey === "1d"), seven = windows.find(item => item.windowKey === "7d"), anomalies: Array<{ severity: "high" | "medium"; title: string; detail: string }> = [];
  if (one?.status === "COMPLETED" && seven?.status === "COMPLETED") {
    const spend = Number(one.metrics.totalCost ?? 0), sales = Number(one.metrics.sales ?? 0), avgSpend = Number(seven.metrics.totalCost ?? 0) / 7, avgSales = Number(seven.metrics.sales ?? 0) / 7;
    if (spend > avgSpend * 1.5) anomalies.push({ severity: "high", title: "昨日花费明显上升", detail: `比近 7 天日均高 ${format((spend / Math.max(avgSpend, .01) - 1) * 100, 1)}%` });
    if (spend > avgSpend * 1.2 && sales < avgSales * .6) anomalies.push({ severity: "high", title: "花费上升但销售下降", detail: "建议检查高花费 Campaign 与搜索词。" });
    if (spend > 0 && sales === 0) anomalies.push({ severity: "high", title: "昨日有花费但没有销售", detail: `已产生 ${format(spend)} 花费。` });
    if (Number(one.metrics.roas ?? 0) < Number(seven.metrics.roas ?? 0) * .7) anomalies.push({ severity: "medium", title: "昨日 ROAS 低于近期水平", detail: `昨日 ${format(Number(one.metrics.roas ?? 0))}，近 7 天 ${format(Number(seven.metrics.roas ?? 0))}。` });
  }
  return { windows, anomalies, generatedAt: Date.now() };
}
