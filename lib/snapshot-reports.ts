import { accountCredentials } from "./accounts";
import { AmazonAdsApiClient, executeDirectCampaignReport } from "./amazon-ads-api";
import type { AmazonCredentials } from "./amazon-mcp";
import { appEnv, d1 } from "./db";

type WindowKey = "1d" | "7d" | "30d" | "90d";
type Metrics = Record<string, number>;
type Group = { campaignId?: string; campaignName?: string; aggregates: Metrics };
type SnapshotPayload = { aggregates: Metrics; groups: Group[]; rowCount: number; provisionalRows: number; updatedAt?: number };

const WINDOWS: Array<{ key: WindowKey; days: number; label: string }> = [
  { key: "1d", days: 1, label: "昨天" },
  { key: "7d", days: 7, label: "近 7 个完整自然日" },
  { key: "30d", days: 30, label: "近 30 个完整自然日" },
  { key: "90d", days: 90, label: "近 90 个完整自然日" },
];
const ROLLING_ATTRIBUTION_DAYS = 15;
const RAW_REPORT_RETENTION_DAYS = 30;

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

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

type FactRow = {
  reportDate: string; campaignId: string; campaignName: string; adGroupId: string; adGroupName: string;
  impressions: number; clicks: number; cost: number; purchases: number; sales: number;
};

function normalizeFacts(rows: unknown[], startDate: string, endDate: string) {
  const facts = new Map<string, FactRow>();
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const source = item as Record<string, unknown>;
    const reportDate = String(source.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate) || reportDate < startDate || reportDate > endDate) continue;
    const campaignName = String(source.campaignName ?? ""), adGroupName = String(source.adGroupName ?? "");
    const campaignId = String(source.campaignId ?? "") || `name:${campaignName || "unknown"}`;
    const adGroupId = String(source.adGroupId ?? "") || `name:${adGroupName || "unknown"}`;
    const key = `${reportDate}\u0000${campaignId}\u0000${adGroupId}`;
    const fact = facts.get(key) ?? { reportDate, campaignId, campaignName, adGroupId, adGroupName, impressions: 0, clicks: 0, cost: 0, purchases: 0, sales: 0 };
    fact.impressions += numberValue(source.impressions);
    fact.clicks += numberValue(source.clicks);
    fact.cost += numberValue(source.cost);
    fact.purchases += numberValue(source.purchases14d);
    fact.sales += numberValue(source.sales14d);
    facts.set(key, fact);
  }
  return [...facts.values()];
}

async function upsertDailyFacts(options: {
  userId: string; accountId: string; syncId: string; reportId: string; startDate: string; endDate: string; rows: unknown[];
}) {
  const facts = normalizeFacts(options.rows, options.startDate, options.endDate);
  const finalThrough = shiftDate(options.endDate, -(ROLLING_ATTRIBUTION_DAYS - 1));
  const now = Date.now();
  for (let offset = 0; offset < facts.length; offset += 60) {
    const statements = facts.slice(offset, offset + 60).map(fact => d1().prepare(
      `INSERT INTO ad_daily_facts(id,user_id,account_id,report_date,campaign_id,campaign_name,ad_group_id,ad_group_name,impressions,clicks,cost,purchases,sales,attribution_final,source_report_id,sync_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(account_id,report_date,campaign_id,ad_group_id) DO UPDATE SET campaign_name=excluded.campaign_name,ad_group_name=excluded.ad_group_name,impressions=excluded.impressions,clicks=excluded.clicks,cost=excluded.cost,purchases=excluded.purchases,sales=excluded.sales,attribution_final=excluded.attribution_final,source_report_id=excluded.source_report_id,sync_id=excluded.sync_id,updated_at=excluded.updated_at`,
    ).bind(crypto.randomUUID(), options.userId, options.accountId, fact.reportDate, fact.campaignId, fact.campaignName || null, fact.adGroupId, fact.adGroupName || null, Math.round(fact.impressions), Math.round(fact.clicks), fact.cost, fact.purchases, fact.sales, fact.reportDate <= finalThrough ? 1 : 0, options.reportId, options.syncId, now));
    await d1().batch(statements);
  }
  await d1().prepare(`DELETE FROM ad_daily_facts WHERE account_id=? AND report_date BETWEEN ? AND ? AND sync_id<>?`).bind(options.accountId, options.startDate, options.endDate, options.syncId).run();
  return facts.length;
}

async function cleanupOldRawReports(userId: string, accountId: string) {
  const cutoff = Date.now() - RAW_REPORT_RETENTION_DAYS * 86_400_000;
  const old = await d1().prepare(`SELECT j.id,f.object_key objectKey FROM report_jobs j JOIN report_files f ON f.report_job_id=j.id WHERE j.user_id=? AND j.account_id=? AND j.create_tool='ads-api-v3:spCampaigns' AND j.completed_at<? ORDER BY j.completed_at LIMIT 40`).bind(userId, accountId, cutoff).all<{ id: string; objectKey: string }>();
  const bucket = appEnv().FILES;
  for (const row of old.results) {
    if (bucket) await bucket.delete(row.objectKey);
    await d1().batch([
      d1().prepare(`DELETE FROM report_files WHERE report_job_id=?`).bind(row.id),
      d1().prepare(`DELETE FROM report_jobs WHERE id=?`).bind(row.id),
    ]);
  }
}

type SyncResult = { syncDate: string; mode: "initial" | "rolling"; startDate: string; endDate: string; status: string; reportId?: string; rowsUpserted?: number; error?: string };

async function runAccountFactSync(
  row: Record<string, unknown>, credentials: AmazonCredentials, force: boolean, onStatus?: (text: string) => void, timeoutMs = 60 * 60_000,
): Promise<SyncResult> {
  const userId = String(row.user_id), accountId = String(row.id), syncDate = localParts(String(row.timezone ?? "UTC")).date;
  const endDate = shiftDate(syncDate, -1), initialStart = shiftDate(endDate, -89);
  const coverage = await d1().prepare(`SELECT MIN(report_date) minDate,MAX(report_date) maxDate,COUNT(*) rowCount FROM ad_daily_facts WHERE user_id=? AND account_id=?`).bind(userId, accountId).first<{ minDate?: string; maxDate?: string; rowCount: number }>();
  const completedInitial = await d1().prepare(`SELECT id FROM ad_data_syncs WHERE user_id=? AND account_id=? AND mode='initial' AND status='COMPLETED' LIMIT 1`).bind(userId, accountId).first<{ id: string }>();
  const initial = !completedInitial && (!coverage?.rowCount || !coverage.minDate || coverage.minDate > initialStart);
  const mode: "initial" | "rolling" = initial ? "initial" : "rolling";
  const startDate = initial ? initialStart : shiftDate(endDate, -(ROLLING_ATTRIBUTION_DAYS - 1));
  const now = Date.now();
  let sync = await d1().prepare(`SELECT id,status,updated_at updatedAt,report_id reportId,rows_upserted rowsUpserted FROM ad_data_syncs WHERE account_id=? AND sync_date=?`).bind(accountId, syncDate).first<{ id: string; status: string; updatedAt: number; reportId?: string; rowsUpserted?: number }>();
  if (!force && sync?.status === "COMPLETED") return { syncDate, mode, startDate, endDate, status: "COMPLETED", reportId: sync.reportId, rowsUpserted: sync.rowsUpserted };
  if (!force && sync?.status === "RUNNING" && now - sync.updatedAt < 65 * 60_000) return { syncDate, mode, startDate, endDate, status: "RUNNING" };
  if (!force && sync?.status === "FAILED" && now - sync.updatedAt < 15 * 60_000) return { syncDate, mode, startDate, endDate, status: "FAILED" };
  const syncId = sync?.id ?? crypto.randomUUID();
  if (!sync) {
    await d1().prepare(`INSERT INTO ad_data_syncs(id,user_id,account_id,sync_date,mode,start_date,end_date,status,rows_upserted,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(syncId, userId, accountId, syncDate, mode, startDate, endDate, "RUNNING", 0, now, now).run();
  } else {
    await d1().prepare(`UPDATE ad_data_syncs SET mode=?,start_date=?,end_date=?,status='RUNNING',error=NULL,updated_at=? WHERE id=?`).bind(mode, startDate, endDate, now, syncId).run();
  }
  try {
    onStatus?.(initial ? `首次建立每日事实库：将分 3 段顺序回填 ${startDate} 至 ${endDate} 的 90 天数据` : `正在刷新 ${startDate} 至 ${endDate} 的最近 ${ROLLING_ATTRIBUTION_DAYS} 天归因数据`);
    const ranges: Array<{ startDate: string; endDate: string }> = [];
    for (let cursor = startDate; cursor <= endDate;) {
      const chunkEnd = initial ? [shiftDate(cursor, 29), endDate].sort()[0] : endDate;
      ranges.push({ startDate: cursor, endDate: chunkEnd });
      cursor = shiftDate(chunkEnd, 1);
    }
    const deadline = Date.now() + timeoutMs;
    const reportIds: string[] = [];
    let rowsUpserted = 0;
    for (let index = 0; index < ranges.length; index++) {
      const range = ranges[index];
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) throw new Error("每日事实库刷新已达到 1 小时上限，可稍后继续未完成的 reportId");
      onStatus?.(`${initial ? `首次回填 ${index + 1}/${ranges.length}` : "滚动刷新"}：${range.startDate} 至 ${range.endDate}`);
      const result = await executeDirectCampaignReport(new AmazonAdsApiClient(credentials), range.startDate, range.endDate, { userId, accountId, timeoutMs: remainingMs, onStatus });
      rowsUpserted += await upsertDailyFacts({ userId, accountId, syncId, reportId: result.reportId, startDate: range.startDate, endDate: range.endDate, rows: result.rows });
      reportIds.push(result.reportId);
    }
    const reportId = reportIds.join(",");
    await d1().prepare(`UPDATE ad_data_syncs SET report_id=?,status='COMPLETED',rows_upserted=?,error=NULL,completed_at=?,updated_at=? WHERE id=?`).bind(reportId, rowsUpserted, Date.now(), Date.now(), syncId).run();
    await d1().prepare(`DELETE FROM report_snapshots WHERE account_id=?`).bind(accountId).run();
    await cleanupOldRawReports(userId, accountId);
    onStatus?.(`每日事实库更新完成：写入 ${rowsUpserted} 条 Campaign / Ad Group 日数据，四个看板窗口将由后端即时计算`);
    return { syncDate, mode, startDate, endDate, status: "COMPLETED", reportId, rowsUpserted };  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await d1().prepare(`UPDATE ad_data_syncs SET status='FAILED',error=?,updated_at=? WHERE id=?`).bind(message.slice(0, 1000), Date.now(), syncId).run();
    onStatus?.(`每日事实库刷新失败：${message}`);
    return { syncDate, mode, startDate, endDate, status: "FAILED", error: message };
  }
}

export async function runDailyReportSnapshots(): Promise<number> {
  const accounts = await d1().prepare(`SELECT id,user_id,name,region,marketplace,timezone,currency,profile_id,advertiser_account_id FROM accounts ORDER BY updated_at`).all<Record<string, unknown>>();
  for (const row of accounts.results) {
    const local = localParts(String(row.timezone ?? "UTC"));
    if (local.hour === 0 && local.minute < 15) continue;
    const sync = await d1().prepare(`SELECT status,updated_at updatedAt FROM ad_data_syncs WHERE account_id=? AND sync_date=?`).bind(row.id, local.date).first<{ status: string; updatedAt: number }>();
    if (sync?.status === "COMPLETED" || (sync?.status === "RUNNING" && Date.now() - sync.updatedAt < 65 * 60_000) || (sync?.status === "FAILED" && Date.now() - sync.updatedAt < 15 * 60_000)) continue;
    const { credentials } = await accountCredentials(String(row.user_id), String(row.id));
    const result = await runAccountFactSync(row, credentials, false);
    return result.status === "COMPLETED" ? 1 : 0;
  }
  return 0;
}

export async function runManualReportSnapshots(userId: string, accountId: string, onStatus?: (text: string) => void) {
  const row = await d1().prepare(`SELECT id,user_id,name,region,marketplace,timezone,currency,profile_id,advertiser_account_id FROM accounts WHERE id=? AND user_id=?`).bind(accountId, userId).first<Record<string, unknown>>();
  if (!row) throw new Error("店铺不存在");
  const { credentials } = await accountCredentials(userId, accountId);
  const result = await runAccountFactSync(row, credentials, true, onStatus, 60 * 60_000);
  return { ...result, windows: WINDOWS.map(window => ({ windowKey: window.key, status: result.status, error: result.error })) };
}

async function aggregateWindow(userId: string, accountId: string, startDate: string, endDate: string): Promise<SnapshotPayload> {
  const aggregate = await d1().prepare(`SELECT COUNT(*) rowCount,COALESCE(SUM(impressions),0) impressions,COALESCE(SUM(clicks),0) clicks,COALESCE(SUM(cost),0) totalCost,COALESCE(SUM(purchases),0) purchases,COALESCE(SUM(sales),0) sales,COALESCE(SUM(CASE WHEN attribution_final=0 THEN 1 ELSE 0 END),0) provisionalRows,MAX(updated_at) updatedAt FROM ad_daily_facts WHERE user_id=? AND account_id=? AND report_date BETWEEN ? AND ?`).bind(userId, accountId, startDate, endDate).first<Record<string, unknown>>();
  const grouped = await d1().prepare(`SELECT campaign_id campaignId,MAX(campaign_name) campaignName,COALESCE(SUM(impressions),0) impressions,COALESCE(SUM(clicks),0) clicks,COALESCE(SUM(cost),0) totalCost,COALESCE(SUM(purchases),0) purchases,COALESCE(SUM(sales),0) sales FROM ad_daily_facts WHERE user_id=? AND account_id=? AND report_date BETWEEN ? AND ? GROUP BY campaign_id`).bind(userId, accountId, startDate, endDate).all<Record<string, unknown>>();
  const metrics: Metrics = {
    impressions: numberValue(aggregate?.impressions), clicks: numberValue(aggregate?.clicks), totalCost: numberValue(aggregate?.totalCost),
    purchases: numberValue(aggregate?.purchases), sales: numberValue(aggregate?.sales),
  };
  const groups = grouped.results.map(row => ({ campaignId: String(row.campaignId ?? "") || undefined, campaignName: String(row.campaignName ?? "") || undefined, aggregates: { impressions: numberValue(row.impressions), clicks: numberValue(row.clicks), totalCost: numberValue(row.totalCost), purchases: numberValue(row.purchases), sales: numberValue(row.sales) } }));
  return { aggregates: metrics, groups, rowCount: numberValue(aggregate?.rowCount), provisionalRows: numberValue(aggregate?.provisionalRows), updatedAt: numberValue(aggregate?.updatedAt) || undefined };
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
  const window = WINDOWS.find(item => item.key === windowKey)!;
  const endDate = shiftDate(localParts(String(options.row.timezone ?? "UTC")).date, -1), startDate = shiftDate(endDate, -(window.days - 1));
  const sync = await d1().prepare(`SELECT status FROM ad_data_syncs WHERE user_id=? AND account_id=? AND end_date=? AND status='COMPLETED' ORDER BY completed_at DESC LIMIT 1`).bind(options.userId, options.accountId, endDate).first<{ status: string }>();
  if (!sync) return null;
  const payload = await aggregateWindow(options.userId, options.accountId, startDate, endDate);
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
  return { type: "answer" as const, content: `已直接查询后端每日事实库，没有调用大模型或重新请求 Amazon 报表。\n\n日期：${window.label}（${startDate} 至 ${endDate}）\n${content}${payload.provisionalRows ? `\n\n提示：范围内包含尚在 14 天归因窗口中的数据，系统会每天自动覆盖更新。` : ""}`, accountId: options.accountId, modelRounds: 0, snapshotPath: true };
}

export async function dashboardData(userId: string, accountId: string) {
  const account = await d1().prepare(`SELECT timezone FROM accounts WHERE id=? AND user_id=?`).bind(accountId, userId).first<{ timezone?: string }>();
  const endDate = shiftDate(localParts(String(account?.timezone ?? "UTC")).date, -1);
  const latestSync = await d1().prepare(`SELECT status,error,mode,start_date startDate,end_date endDate,rows_upserted rowsUpserted,updated_at updatedAt,completed_at completedAt FROM ad_data_syncs WHERE user_id=? AND account_id=? ORDER BY sync_date DESC,updated_at DESC LIMIT 1`).bind(userId, accountId).first<Record<string, unknown>>();
  const windows = [];
  for (const window of WINDOWS) {
    const startDate = shiftDate(endDate, -(window.days - 1));
    const payload = await aggregateWindow(userId, accountId, startDate, endDate);
    const a = payload.aggregates;
    const metrics: Metrics = { ...a, roas: a.totalCost ? (a.sales ?? 0) / a.totalCost : 0, acos: a.sales ? (a.totalCost ?? 0) / a.sales * 100 : 0, ctr: a.impressions ? (a.clicks ?? 0) / a.impressions * 100 : 0 };
    const current = latestSync?.status === "COMPLETED" && latestSync.endDate === endDate;
    const status = current ? "COMPLETED" : latestSync?.status === "COMPLETED" ? "STALE" : String(latestSync?.status ?? "EMPTY");
    const error = status === "STALE" ? "每日事实库尚未刷新到昨天，正在等待 00:15 自动任务或手动刷新" : latestSync?.error;
    windows.push({ windowKey: window.key, startDate, endDate, status, error, completedAt: latestSync?.completedAt, rowCount: payload.rowCount, metrics, provisionalRows: payload.provisionalRows, topCampaigns: [...payload.groups].sort((x, y) => (y.aggregates.totalCost ?? 0) - (x.aggregates.totalCost ?? 0)).slice(0, 5) });
  }
  const one = windows.find(item => item.windowKey === "1d"), seven = windows.find(item => item.windowKey === "7d"), anomalies: Array<{ severity: "high" | "medium"; title: string; detail: string }> = [];
  if (one?.status === "COMPLETED" && seven?.status === "COMPLETED") {
    const spend = Number(one.metrics.totalCost ?? 0), sales = Number(one.metrics.sales ?? 0), avgSpend = Number(seven.metrics.totalCost ?? 0) / 7, avgSales = Number(seven.metrics.sales ?? 0) / 7;
    if (spend > avgSpend * 1.5) anomalies.push({ severity: "high", title: "昨日花费明显上升", detail: `比近 7 天日均高 ${format((spend / Math.max(avgSpend, .01) - 1) * 100, 1)}%` });
    if (spend > avgSpend * 1.2 && sales < avgSales * .6) anomalies.push({ severity: "high", title: "花费上升但销售下降", detail: "建议检查高花费 Campaign 与搜索词。" });
    if (spend > 0 && sales === 0) anomalies.push({ severity: "high", title: "昨日有花费但没有销售", detail: `已产生 ${format(spend)} 花费。` });
    if (Number(one.metrics.roas ?? 0) < Number(seven.metrics.roas ?? 0) * .7) anomalies.push({ severity: "medium", title: "昨日 ROAS 低于近期水平", detail: `昨日 ${format(Number(one.metrics.roas ?? 0))}，近 7 天 ${format(Number(seven.metrics.roas ?? 0))}。` });
  }
  return { windows, anomalies, latestSync, generatedAt: Date.now() };
}