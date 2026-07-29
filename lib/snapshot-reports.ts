import { accountCredentials } from "./accounts";
import { AmazonAdsApiClient, executeDirectReport, type AmazonAdsReportKind } from "./amazon-ads-api";
import type { AmazonCredentials } from "./amazon-mcp";
import { appEnv, d1 } from "./db";
import { runAnomalyAnalysis } from "./anomaly-analysis";

type WindowKey = "1d" | "7d" | "30d" | "90d";
type Metrics = Record<string, number>;
type Group = { campaignId?: string; campaignName?: string; label?: string; secondary?: string; aggregates: Metrics };
type SnapshotPayload = { aggregates: Metrics; groups: Group[]; rowCount: number; provisionalRows: number; updatedAt?: number };
type NormalizedBase = { reportDate: string; campaignId: string; campaignName: string; adGroupId: string; adGroupName: string; impressions: number; clicks: number; cost: number; purchases: number; sales: number };

const WINDOWS: Array<{ key: WindowKey; days: number; label: string }> = [
  { key: "1d", days: 1, label: "昨天" }, { key: "7d", days: 7, label: "近 7 个完整自然日" },
  { key: "30d", days: 30, label: "近 30 个完整自然日" }, { key: "90d", days: 90, label: "近 90 个完整自然日" },
];
const REPORT_KINDS: AmazonAdsReportKind[] = ["campaign", "keyword", "searchTerm"];
const REPORT_LABELS: Record<AmazonAdsReportKind, string> = { campaign: "Campaign / Ad Group", keyword: "投放关键词", searchTerm: "客户搜索词" };
const FACT_TABLES: Record<AmazonAdsReportKind, string> = { campaign: "ad_daily_facts", keyword: "ad_keyword_daily_facts", searchTerm: "ad_search_term_daily_facts" };
const ROLLING_ATTRIBUTION_DAYS = 15, RAW_REPORT_RETENTION_DAYS = 30;

function localParts(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? "";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, hour: Number(value("hour")), minute: Number(value("minute")) };
}
function shiftDate(date: string, days: number) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function numberValue(value: unknown) { const number = Number(value ?? 0); return Number.isFinite(number) ? number : 0; }
function sourceBase(source: Record<string, unknown>): NormalizedBase {
  return { reportDate: String(source.date ?? ""), campaignId: String(source.campaignId ?? "") || `name:${String(source.campaignName ?? "unknown")}`, campaignName: String(source.campaignName ?? ""), adGroupId: String(source.adGroupId ?? "") || `name:${String(source.adGroupName ?? "unknown")}`, adGroupName: String(source.adGroupName ?? ""), impressions: numberValue(source.impressions), clicks: numberValue(source.clicks), cost: numberValue(source.cost), purchases: numberValue(source.purchases14d), sales: numberValue(source.sales14d) };
}
function validDate(date: string, startDate: string, endDate: string) { return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= startDate && date <= endDate; }
function addBase(target: NormalizedBase, source: NormalizedBase) { target.impressions += source.impressions; target.clicks += source.clicks; target.cost += source.cost; target.purchases += source.purchases; target.sales += source.sales; }

function normalizeCampaignFacts(rows: unknown[], startDate: string, endDate: string) {
  const facts = new Map<string, NormalizedBase>();
  for (const item of rows) { if (!item || typeof item !== "object") continue; const row = sourceBase(item as Record<string, unknown>); if (!validDate(row.reportDate, startDate, endDate)) continue; const key = `${row.reportDate}\0${row.campaignId}\0${row.adGroupId}`, target = facts.get(key); if (target) addBase(target, row); else facts.set(key, row); }
  return [...facts.values()];
}
type KeywordFact = NormalizedBase & { keywordId: string; keyword: string; keywordType: string; matchType: string; keywordBid: number | null; keywordStatus: string };
function normalizeKeywordFacts(rows: unknown[], startDate: string, endDate: string) {
  const facts = new Map<string, KeywordFact>();
  for (const item of rows) {
    if (!item || typeof item !== "object") continue; const source = item as Record<string, unknown>, base = sourceBase(source); if (!validDate(base.reportDate, startDate, endDate)) continue;
    const keyword = String(source.keyword ?? source.targeting ?? ""), keywordId = String(source.keywordId ?? "") || `text:${keyword}:${String(source.matchType ?? "")}`;
    const row: KeywordFact = { ...base, keywordId, keyword, keywordType: String(source.keywordType ?? ""), matchType: String(source.matchType ?? ""), keywordBid: source.keywordBid == null ? null : numberValue(source.keywordBid), keywordStatus: String(source.adKeywordStatus ?? "") };
    const key = `${row.reportDate}\0${row.campaignId}\0${row.adGroupId}\0${keywordId}`, target = facts.get(key); if (target) addBase(target, row); else facts.set(key, row);
  }
  return [...facts.values()];
}
type SearchFact = NormalizedBase & { keywordId: string; keyword: string; keywordType: string; matchType: string; targeting: string; searchTerm: string };
function normalizeSearchFacts(rows: unknown[], startDate: string, endDate: string) {
  const facts = new Map<string, SearchFact>();
  for (const item of rows) {
    if (!item || typeof item !== "object") continue; const source = item as Record<string, unknown>, base = sourceBase(source); if (!validDate(base.reportDate, startDate, endDate)) continue;
    const targeting = String(source.targeting ?? ""), keyword = String(source.keyword ?? ""), searchTerm = String(source.searchTerm ?? ""); if (!searchTerm) continue;
    const keywordId = String(source.keywordId ?? "") || `source:${String(source.keywordType ?? "")}:${keyword || targeting || "unknown"}`;
    const row: SearchFact = { ...base, keywordId, keyword, keywordType: String(source.keywordType ?? ""), matchType: String(source.matchType ?? ""), targeting, searchTerm };
    const key = `${row.reportDate}\0${row.campaignId}\0${row.adGroupId}\0${keywordId}\0${searchTerm}`, target = facts.get(key); if (target) addBase(target, row); else facts.set(key, row);
  }
  return [...facts.values()];
}

async function upsertReportFacts(kind: AmazonAdsReportKind, options: { userId: string; accountId: string; syncId: string; reportId: string; startDate: string; endDate: string; rows: unknown[] }) {
  const finalThrough = shiftDate(options.endDate, -(ROLLING_ATTRIBUTION_DAYS - 1)), now = Date.now();
  const facts = kind === "campaign" ? normalizeCampaignFacts(options.rows, options.startDate, options.endDate) : kind === "keyword" ? normalizeKeywordFacts(options.rows, options.startDate, options.endDate) : normalizeSearchFacts(options.rows, options.startDate, options.endDate);
  for (let offset = 0; offset < facts.length; offset += 50) {
    const statements = facts.slice(offset, offset + 50).map(source => {
      const base = source as NormalizedBase, common = [crypto.randomUUID(), options.userId, options.accountId, base.reportDate, base.campaignId, base.campaignName || null, base.adGroupId, base.adGroupName || null];
      if (kind === "campaign") return d1().prepare(`INSERT INTO ad_daily_facts(id,user_id,account_id,report_date,campaign_id,campaign_name,ad_group_id,ad_group_name,impressions,clicks,cost,purchases,sales,attribution_final,source_report_id,sync_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(account_id,report_date,campaign_id,ad_group_id) DO UPDATE SET campaign_name=excluded.campaign_name,ad_group_name=excluded.ad_group_name,impressions=excluded.impressions,clicks=excluded.clicks,cost=excluded.cost,purchases=excluded.purchases,sales=excluded.sales,attribution_final=excluded.attribution_final,source_report_id=excluded.source_report_id,sync_id=excluded.sync_id,updated_at=excluded.updated_at`).bind(...common, Math.round(base.impressions), Math.round(base.clicks), base.cost, base.purchases, base.sales, base.reportDate <= finalThrough ? 1 : 0, options.reportId, options.syncId, now);
      if (kind === "keyword") { const row = source as KeywordFact; return d1().prepare(`INSERT INTO ad_keyword_daily_facts(id,user_id,account_id,report_date,campaign_id,campaign_name,ad_group_id,ad_group_name,keyword_id,keyword,keyword_type,match_type,keyword_bid,keyword_status,impressions,clicks,cost,purchases,sales,attribution_final,source_report_id,sync_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(account_id,report_date,campaign_id,ad_group_id,keyword_id) DO UPDATE SET campaign_name=excluded.campaign_name,ad_group_name=excluded.ad_group_name,keyword=excluded.keyword,keyword_type=excluded.keyword_type,match_type=excluded.match_type,keyword_bid=excluded.keyword_bid,keyword_status=excluded.keyword_status,impressions=excluded.impressions,clicks=excluded.clicks,cost=excluded.cost,purchases=excluded.purchases,sales=excluded.sales,attribution_final=excluded.attribution_final,source_report_id=excluded.source_report_id,sync_id=excluded.sync_id,updated_at=excluded.updated_at`).bind(...common, row.keywordId, row.keyword, row.keywordType || null, row.matchType || null, row.keywordBid, row.keywordStatus || null, Math.round(base.impressions), Math.round(base.clicks), base.cost, base.purchases, base.sales, base.reportDate <= finalThrough ? 1 : 0, options.reportId, options.syncId, now); }
      const row = source as SearchFact; return d1().prepare(`INSERT INTO ad_search_term_daily_facts(id,user_id,account_id,report_date,campaign_id,campaign_name,ad_group_id,ad_group_name,keyword_id,keyword,keyword_type,match_type,targeting,search_term,impressions,clicks,cost,purchases,sales,attribution_final,source_report_id,sync_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(account_id,report_date,campaign_id,ad_group_id,keyword_id,search_term) DO UPDATE SET campaign_name=excluded.campaign_name,ad_group_name=excluded.ad_group_name,keyword=excluded.keyword,keyword_type=excluded.keyword_type,match_type=excluded.match_type,targeting=excluded.targeting,impressions=excluded.impressions,clicks=excluded.clicks,cost=excluded.cost,purchases=excluded.purchases,sales=excluded.sales,attribution_final=excluded.attribution_final,source_report_id=excluded.source_report_id,sync_id=excluded.sync_id,updated_at=excluded.updated_at`).bind(...common, row.keywordId, row.keyword || null, row.keywordType || null, row.matchType || null, row.targeting || null, row.searchTerm, Math.round(base.impressions), Math.round(base.clicks), base.cost, base.purchases, base.sales, base.reportDate <= finalThrough ? 1 : 0, options.reportId, options.syncId, now);
    });
    await d1().batch(statements);
  }
  await d1().prepare(`DELETE FROM ${FACT_TABLES[kind]} WHERE account_id=? AND report_date BETWEEN ? AND ? AND sync_id<>?`).bind(options.accountId, options.startDate, options.endDate, options.syncId).run();
  return facts.length;
}

async function cleanupOldRawReports(userId: string, accountId: string) {
  const cutoff = Date.now() - RAW_REPORT_RETENTION_DAYS * 86_400_000;
  const old = await d1().prepare(`SELECT j.id,f.object_key objectKey FROM report_jobs j JOIN report_files f ON f.report_job_id=j.id WHERE j.user_id=? AND j.account_id=? AND j.create_tool LIKE 'ads-api-v3:%' AND j.completed_at<? ORDER BY j.completed_at LIMIT 40`).bind(userId, accountId, cutoff).all<{ id: string; objectKey: string }>();
  for (const row of old.results) { if (appEnv().FILES) await appEnv().FILES!.delete(row.objectKey); await d1().batch([d1().prepare(`DELETE FROM report_files WHERE report_job_id=?`).bind(row.id), d1().prepare(`DELETE FROM report_jobs WHERE id=?`).bind(row.id)]); }
}

type KindSyncResult = { reportKind: AmazonAdsReportKind; syncDate: string; mode: "initial" | "rolling"; startDate: string; endDate: string; status: string; reportId?: string; rowsUpserted?: number; error?: string };
async function runReportKindSync(row: Record<string, unknown>, credentials: AmazonCredentials, client: AmazonAdsApiClient, kind: AmazonAdsReportKind, force: boolean, onStatus?: (text: string) => void, timeoutMs = 60 * 60_000, forceInitial = false, triggerType: "manual" | "automatic" = "automatic"): Promise<KindSyncResult> {
  const userId = String(row.user_id), accountId = String(row.id), syncDate = localParts(String(row.timezone ?? "UTC")).date, endDate = shiftDate(syncDate, -1), initialStart = shiftDate(endDate, -89), table = FACT_TABLES[kind];
  const coverage = await d1().prepare(`SELECT MIN(report_date) minDate,COUNT(*) rowCount FROM ${table} WHERE user_id=? AND account_id=?`).bind(userId, accountId).first<{ minDate?: string; rowCount: number }>();
  const completedInitial = await d1().prepare(`SELECT id FROM ad_report_syncs WHERE user_id=? AND account_id=? AND report_kind=? AND mode='initial' AND status='COMPLETED' LIMIT 1`).bind(userId, accountId, kind).first<{ id: string }>();
  const initial = forceInitial || (!completedInitial && (!coverage?.rowCount || !coverage.minDate || coverage.minDate > initialStart)), mode: "initial" | "rolling" = initial ? "initial" : "rolling", startDate = initial ? initialStart : shiftDate(endDate, -(ROLLING_ATTRIBUTION_DAYS - 1)), now = Date.now();
  let sync = await d1().prepare(`SELECT id,status,updated_at updatedAt,report_id reportId,rows_upserted rowsUpserted FROM ad_report_syncs WHERE account_id=? AND sync_date=? AND report_kind=?`).bind(accountId, syncDate, kind).first<{ id: string; status: string; updatedAt: number; reportId?: string; rowsUpserted?: number }>();
  if (!force && sync?.status === "COMPLETED") return { reportKind: kind, syncDate, mode, startDate, endDate, status: "COMPLETED", reportId: sync.reportId, rowsUpserted: sync.rowsUpserted };
  if (!force && sync?.status === "RUNNING" && now - sync.updatedAt < 65 * 60_000) return { reportKind: kind, syncDate, mode, startDate, endDate, status: "RUNNING" };
  if (!force && sync?.status === "FAILED" && now - sync.updatedAt < 15 * 60_000) return { reportKind: kind, syncDate, mode, startDate, endDate, status: "FAILED" };
  const syncId = sync?.id ?? crypto.randomUUID();
  if (!sync) await d1().prepare(`INSERT INTO ad_report_syncs(id,user_id,account_id,sync_date,report_kind,mode,trigger_type,start_date,end_date,status,rows_upserted,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(syncId, userId, accountId, syncDate, kind, mode, triggerType, startDate, endDate, "RUNNING", 0, now, now).run();
  else await d1().prepare(`UPDATE ad_report_syncs SET mode=?,trigger_type=?,start_date=?,end_date=?,status='RUNNING',error=NULL,updated_at=? WHERE id=?`).bind(mode, triggerType, startDate, endDate, now, syncId).run();
  try {
    onStatus?.(`${REPORT_LABELS[kind]}：${initial ? "首次90天回填，将按最多30天一段顺序处理" : `刷新最近 ${ROLLING_ATTRIBUTION_DAYS} 天归因数据`}`);
    const ranges: Array<{ startDate: string; endDate: string }> = [];
    for (let cursor = startDate; cursor <= endDate;) { const chunkEnd = initial ? [shiftDate(cursor, 29), endDate].sort()[0] : endDate; ranges.push({ startDate: cursor, endDate: chunkEnd }); cursor = shiftDate(chunkEnd, 1); }
    const deadline = Date.now() + timeoutMs, reportIds: string[] = []; let rowsUpserted = 0;
    for (let index = 0; index < ranges.length; index++) {
      const range = ranges[index], remainingMs = deadline - Date.now(); if (remainingMs <= 0) throw new Error(`${REPORT_LABELS[kind]}刷新达到整体等待上限，可稍后继续已有 reportId`);
      onStatus?.(`${REPORT_LABELS[kind]} ${initial ? `回填 ${index + 1}/${ranges.length}` : "滚动刷新"}：${range.startDate} 至 ${range.endDate}`);
      const result = await executeDirectReport(client, kind, range.startDate, range.endDate, { userId, accountId, timeoutMs: remainingMs, onStatus });
      rowsUpserted += await upsertReportFacts(kind, { userId, accountId, syncId, reportId: result.reportId, startDate: range.startDate, endDate: range.endDate, rows: result.rows }); reportIds.push(result.reportId);
    }
    const reportId = reportIds.join(",");
    await d1().prepare(`UPDATE ad_report_syncs SET report_id=?,status='COMPLETED',rows_upserted=?,error=NULL,completed_at=?,updated_at=? WHERE id=?`).bind(reportId, rowsUpserted, Date.now(), Date.now(), syncId).run();
    onStatus?.(`${REPORT_LABELS[kind]}完成：写入 ${rowsUpserted} 条日数据`);
    return { reportKind: kind, syncDate, mode, startDate, endDate, status: "COMPLETED", reportId, rowsUpserted };
  } catch (error) { const message = error instanceof Error ? error.message : String(error); await d1().prepare(`UPDATE ad_report_syncs SET status='FAILED',error=?,updated_at=? WHERE id=?`).bind(message.slice(0, 1000), Date.now(), syncId).run(); onStatus?.(`${REPORT_LABELS[kind]}失败：${message}`); return { reportKind: kind, syncDate, mode, startDate, endDate, status: "FAILED", error: message }; }
}

export async function runDailyReportSnapshots(): Promise<number> {
  const accounts = await d1().prepare(`SELECT id,user_id,name,region,marketplace,timezone,currency,profile_id,advertiser_account_id FROM accounts ORDER BY updated_at`).all<Record<string, unknown>>();
  for (const row of accounts.results) {
    const local = localParts(String(row.timezone ?? "UTC")); if (local.hour === 0 && local.minute < 15) continue;
    const analyzeIfReady = async () => {
      const ready = await d1().prepare(`SELECT COUNT(DISTINCT report_kind) count FROM ad_report_syncs WHERE account_id=? AND sync_date=? AND status='COMPLETED'`).bind(row.id, local.date).first<{ count: number }>();
      if (Number(ready?.count ?? 0) !== REPORT_KINDS.length) return false;
      const analyzed = await d1().prepare(`SELECT COUNT(DISTINCT report_kind) count FROM ad_anomaly_analyses WHERE account_id=? AND analysis_date=? AND status='COMPLETED'`).bind(row.id, local.date).first<{ count: number }>();
      if (Number(analyzed?.count ?? 0) === REPORT_KINDS.length) return false;
      await runAnomalyAnalysis(String(row.user_id), String(row.id));
      return true;
    };
    for (const kind of REPORT_KINDS) {
      const sync = await d1().prepare(`SELECT status,updated_at updatedAt FROM ad_report_syncs WHERE account_id=? AND sync_date=? AND report_kind=?`).bind(row.id, local.date, kind).first<{ status: string; updatedAt: number }>();
      if (sync?.status === "COMPLETED" || (sync?.status === "RUNNING" && Date.now() - sync.updatedAt < 65 * 60_000) || (sync?.status === "FAILED" && Date.now() - sync.updatedAt < 15 * 60_000)) continue;
      const { credentials } = await accountCredentials(String(row.user_id), String(row.id));
      const result = await runReportKindSync(row, credentials, new AmazonAdsApiClient(credentials), kind, false); return result.status === "COMPLETED" ? 1 : 0;
    }
    if (await analyzeIfReady()) return 1;
  }
  return 0;
}

export async function runManualReportSnapshots(userId: string, accountId: string, onStatus?: (text: string) => void, options: { forceInitial?: boolean } = {}) {
  const row = await d1().prepare(`SELECT id,user_id,name,region,marketplace,timezone,currency,profile_id,advertiser_account_id FROM accounts WHERE id=? AND user_id=?`).bind(accountId, userId).first<Record<string, unknown>>(); if (!row) throw new Error("店铺不存在");
  const { credentials } = await accountCredentials(userId, accountId), client = new AmazonAdsApiClient(credentials), deadline = Date.now() + 60 * 60_000, reports: KindSyncResult[] = [];
  onStatus?.("开始同步 Campaign、投放关键词、客户搜索词三类每日数据；首次回填会自动分段，整体最长等待 1 小时");
  for (const kind of REPORT_KINDS) { const remainingMs = deadline - Date.now(); if (remainingMs <= 0) { reports.push({ reportKind: kind, syncDate: localParts(String(row.timezone ?? "UTC")).date, mode: "rolling", startDate: "", endDate: "", status: "FAILED", error: "三类数据整体等待已达到1小时" }); continue; } reports.push(await runReportKindSync(row, credentials, client, kind, true, onStatus, remainingMs, Boolean(options.forceInitial), "manual")); }
  const completed = reports.every(item => item.status === "COMPLETED"), analysis = null;
  if (completed) { await d1().prepare(`DELETE FROM report_snapshots WHERE account_id=?`).bind(accountId).run(); await cleanupOldRawReports(userId, accountId); }
  return { syncDate: localParts(String(row.timezone ?? "UTC")).date, status: completed ? "COMPLETED" : "FAILED", reports, analysis, windows: reports.map(item => ({ windowKey: item.reportKind, status: item.status, error: item.error })) };
}

async function aggregateCampaignWindow(userId: string, accountId: string, startDate: string, endDate: string): Promise<SnapshotPayload> {
  const aggregate = await d1().prepare(`SELECT COUNT(*) rowCount,COALESCE(SUM(impressions),0) impressions,COALESCE(SUM(clicks),0) clicks,COALESCE(SUM(cost),0) totalCost,COALESCE(SUM(purchases),0) purchases,COALESCE(SUM(sales),0) sales,COALESCE(SUM(CASE WHEN attribution_final=0 THEN 1 ELSE 0 END),0) provisionalRows,MAX(updated_at) updatedAt FROM ad_daily_facts WHERE user_id=? AND account_id=? AND report_date BETWEEN ? AND ?`).bind(userId, accountId, startDate, endDate).first<Record<string, unknown>>();
  const grouped = await d1().prepare(`SELECT campaign_id campaignId,MAX(campaign_name) campaignName,COALESCE(SUM(impressions),0) impressions,COALESCE(SUM(clicks),0) clicks,COALESCE(SUM(cost),0) totalCost,COALESCE(SUM(purchases),0) purchases,COALESCE(SUM(sales),0) sales FROM ad_daily_facts WHERE user_id=? AND account_id=? AND report_date BETWEEN ? AND ? GROUP BY campaign_id`).bind(userId, accountId, startDate, endDate).all<Record<string, unknown>>();
  return payloadFromRows(aggregate, grouped.results.map(row => ({ ...row, label: row.campaignName, secondary: `ID ${row.campaignId}` })));
}
function payloadFromRows(aggregate: Record<string, unknown> | null, grouped: Record<string, unknown>[]): SnapshotPayload {
  const metrics = (row: Record<string, unknown>): Metrics => ({ impressions: numberValue(row.impressions), clicks: numberValue(row.clicks), totalCost: numberValue(row.totalCost), purchases: numberValue(row.purchases), sales: numberValue(row.sales) });
  return { aggregates: metrics(aggregate ?? {}), groups: grouped.map(row => ({ campaignId: String(row.campaignId ?? "") || undefined, campaignName: String(row.campaignName ?? "") || undefined, label: String(row.label ?? "") || undefined, secondary: String(row.secondary ?? "") || undefined, aggregates: metrics(row) })), rowCount: numberValue(aggregate?.rowCount), provisionalRows: numberValue(aggregate?.provisionalRows), updatedAt: numberValue(aggregate?.updatedAt) || undefined };
}
async function aggregateEntityWindow(kind: "keyword" | "searchTerm", userId: string, accountId: string, startDate: string, endDate: string): Promise<SnapshotPayload> {
  const table = FACT_TABLES[kind], labelColumn = kind === "keyword" ? "keyword" : "search_term", secondaryColumn = kind === "keyword" ? "match_type" : "COALESCE(NULLIF(keyword,''),targeting)";
  const aggregate = await d1().prepare(`SELECT COUNT(*) rowCount,COALESCE(SUM(impressions),0) impressions,COALESCE(SUM(clicks),0) clicks,COALESCE(SUM(cost),0) totalCost,COALESCE(SUM(purchases),0) purchases,COALESCE(SUM(sales),0) sales,COALESCE(SUM(CASE WHEN attribution_final=0 THEN 1 ELSE 0 END),0) provisionalRows,MAX(updated_at) updatedAt FROM ${table} WHERE user_id=? AND account_id=? AND report_date BETWEEN ? AND ?`).bind(userId, accountId, startDate, endDate).first<Record<string, unknown>>();
  const grouped = await d1().prepare(`SELECT ${labelColumn} label,MAX(${secondaryColumn}) secondary,MAX(campaign_name) campaignName,COALESCE(SUM(impressions),0) impressions,COALESCE(SUM(clicks),0) clicks,COALESCE(SUM(cost),0) totalCost,COALESCE(SUM(purchases),0) purchases,COALESCE(SUM(sales),0) sales FROM ${table} WHERE user_id=? AND account_id=? AND report_date BETWEEN ? AND ? GROUP BY ${labelColumn}`).bind(userId, accountId, startDate, endDate).all<Record<string, unknown>>();
  return payloadFromRows(aggregate, grouped.results);
}
function requestedWindow(message: string): WindowKey | null { if (/昨天|昨日|yesterday/i.test(message)) return "1d"; if (/近\s*7\s*天|最近\s*7\s*天|过去\s*7\s*天|last\s*7/i.test(message)) return "7d"; if (/近\s*30\s*天|最近\s*30\s*天|过去\s*30\s*天|last\s*30/i.test(message)) return "30d"; if (/近\s*90\s*天|最近\s*90\s*天|过去\s*90\s*天|last\s*90/i.test(message)) return "90d"; return null; }
function format(value: number, digits = 2) { return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(value); }
function metricFor(message: string): { key: string; label: string; derived?: (a: Metrics) => number } { if (/roas|广告投入产出/i.test(message)) return { key: "roas", label: "ROAS", derived: a => a.totalCost ? (a.sales ?? 0) / a.totalCost : 0 }; if (/acos/i.test(message)) return { key: "acos", label: "ACOS", derived: a => a.sales ? (a.totalCost ?? 0) / a.sales * 100 : 0 }; if (/点击率|ctr/i.test(message)) return { key: "ctr", label: "CTR", derived: a => a.impressions ? (a.clicks ?? 0) / a.impressions * 100 : 0 }; if (/销售额|销售|sales/i.test(message)) return { key: "sales", label: "销售额" }; if (/点击|click/i.test(message)) return { key: "clicks", label: "点击量" }; if (/曝光|展示|impression/i.test(message)) return { key: "impressions", label: "曝光量" }; if (/订单|购买|purchase/i.test(message)) return { key: "purchases", label: "订单量" }; return { key: "totalCost", label: "花费" }; }

export async function trySavedSnapshotQuery(options: { userId: string; accountId: string; message: string; row: Record<string, unknown> }) {
  const windowKey = requestedWindow(options.message); if (!windowKey || !/查|查询|多少|总额|总计|汇总|统计|最高|最低|最多|最少|排名|排行|表现|数据|report/i.test(options.message)) return null;
  const kind: AmazonAdsReportKind = /搜索词|客户搜索|search\s*term/i.test(options.message) ? "searchTerm" : /关键词|投放词|keyword/i.test(options.message) ? "keyword" : "campaign", window = WINDOWS.find(item => item.key === windowKey)!, endDate = shiftDate(localParts(String(options.row.timezone ?? "UTC")).date, -1), startDate = shiftDate(endDate, -(window.days - 1));
  const sync = await d1().prepare(`SELECT status FROM ad_report_syncs WHERE user_id=? AND account_id=? AND report_kind=? AND end_date=? AND status='COMPLETED' ORDER BY completed_at DESC LIMIT 1`).bind(options.userId, options.accountId, kind, endDate).first<{ status: string }>(); if (!sync) return null;
  const payload = kind === "campaign" ? await aggregateCampaignWindow(options.userId, options.accountId, startDate, endDate) : await aggregateEntityWindow(kind, options.userId, options.accountId, startDate, endDate), metric = metricFor(options.message), valueFor = (a: Metrics) => metric.derived ? metric.derived(a) : Number(a[metric.key] ?? 0), descending = !/最低|最少/i.test(options.message), ranking = /最高|最低|最多|最少|排名|排行|哪个|哪一个/i.test(options.message), currency = String(options.row.currency ?? "USD").toUpperCase(), percentage = ["acos", "ctr"].includes(metric.key);
  let content: string;
  if (ranking) { const ranked = payload.groups.map(group => ({ group, value: valueFor(group.aggregates) })).sort((a, b) => descending ? b.value - a.value : a.value - b.value); if (!ranked.length) return null; const top = ranked.slice(0, 5).map((item, index) => `${index + 1}. ${item.group.label || item.group.campaignName || "未命名"}${item.group.secondary ? `（${item.group.secondary}）` : ""}：${format(item.value)}${percentage ? "%" : ["totalCost", "sales"].includes(metric.key) ? ` ${currency}` : ""}`).join("\n"); content = `${descending ? "最高" : "最低"}${metric.label}的${REPORT_LABELS[kind]}是：${ranked[0].group.label || ranked[0].group.campaignName || "未命名"}\n\n前 5 名：\n${top}`; }
  else { const value = valueFor(payload.aggregates); content = `${metric.label}：${format(value)}${percentage ? "%" : ["totalCost", "sales"].includes(metric.key) ? ` ${currency}` : ""}\n数据行：${payload.rowCount}`; }
  return { type: "answer" as const, content: `已直接查询后端${REPORT_LABELS[kind]}每日事实库，没有调用大模型或重新请求 Amazon 报表。\n\n日期：${window.label}（${startDate} 至 ${endDate}）\n${content}${payload.provisionalRows ? "\n\n提示：范围内包含尚在14天归因窗口中的数据，系统会每天覆盖更新。" : ""}`, accountId: options.accountId, modelRounds: 0, snapshotPath: true };
}

function insightRows(payload: SnapshotPayload) {
  const mapped = payload.groups.map(group => {
    const a = group.aggregates, metrics: Metrics = { ...a, roas: a.totalCost ? (a.sales ?? 0) / a.totalCost : 0, acos: a.sales ? (a.totalCost ?? 0) / a.sales * 100 : 0, ctr: a.impressions ? (a.clicks ?? 0) / a.impressions * 100 : 0 };
    return { label: group.label || "未命名", secondary: group.secondary, campaignName: group.campaignName, metrics };
  });
  return { topBySales: [...mapped].sort((a, b) => b.metrics.sales - a.metrics.sales).slice(0, 8), highSpendNoOrder: mapped.filter(item => item.metrics.totalCost > 0 && item.metrics.purchases === 0).sort((a, b) => b.metrics.totalCost - a.metrics.totalCost).slice(0, 8) };
}export async function dashboardData(userId: string, accountId: string) {
  const account = await d1().prepare(`SELECT timezone FROM accounts WHERE id=? AND user_id=?`).bind(accountId, userId).first<{ timezone?: string }>(), endDate = shiftDate(localParts(String(account?.timezone ?? "UTC")).date, -1);
  const syncRows = await d1().prepare(`SELECT sync_date syncDate,report_kind reportKind,status,error,mode,trigger_type triggerType,start_date startDate,end_date endDate,rows_upserted rowsUpserted,updated_at updatedAt,completed_at completedAt FROM ad_report_syncs WHERE user_id=? AND account_id=? AND sync_date=(SELECT MAX(sync_date) FROM ad_report_syncs WHERE user_id=? AND account_id=?)`).bind(userId, accountId, userId, accountId).all<Record<string, unknown>>(), syncByKind = new Map(syncRows.results.map(row => [String(row.reportKind), row]));
  const windows = [];
  for (const window of WINDOWS) { const startDate = shiftDate(endDate, -(window.days - 1)), payload = await aggregateCampaignWindow(userId, accountId, startDate, endDate), a = payload.aggregates, metrics: Metrics = { ...a, roas: a.totalCost ? (a.sales ?? 0) / a.totalCost : 0, acos: a.sales ? (a.totalCost ?? 0) / a.sales * 100 : 0, ctr: a.impressions ? (a.clicks ?? 0) / a.impressions * 100 : 0 }, sync = syncByKind.get("campaign"), current = sync?.status === "COMPLETED" && sync.endDate === endDate, status = current ? "COMPLETED" : sync?.status === "COMPLETED" ? "STALE" : String(sync?.status ?? "EMPTY"), error = status === "STALE" ? "Campaign每日事实尚未刷新到昨天" : sync?.error; windows.push({ windowKey: window.key, startDate, endDate, status, error, completedAt: sync?.completedAt, rowCount: payload.rowCount, metrics, provisionalRows: payload.provisionalRows, topCampaigns: [...payload.groups].sort((x, y) => (y.aggregates.totalCost ?? 0) - (x.aggregates.totalCost ?? 0)).slice(0, 5) }); }
  const insightStart = shiftDate(endDate, -29), keywordPayload = await aggregateEntityWindow("keyword", userId, accountId, insightStart, endDate), searchPayload = await aggregateEntityWindow("searchTerm", userId, accountId, insightStart, endDate), keywordSync = syncByKind.get("keyword"), searchSync = syncByKind.get("searchTerm");
  const keywordInsights = { startDate: insightStart, endDate, status: keywordSync?.status === "COMPLETED" && keywordSync.endDate === endDate ? "COMPLETED" : String(keywordSync?.status ?? "EMPTY"), ...insightRows(keywordPayload) }, searchTermInsights = { startDate: insightStart, endDate, status: searchSync?.status === "COMPLETED" && searchSync.endDate === endDate ? "COMPLETED" : String(searchSync?.status ?? "EMPTY"), ...insightRows(searchPayload) };
  const one = windows.find(item => item.windowKey === "1d"), seven = windows.find(item => item.windowKey === "7d"), anomalies: Array<{ severity: "high" | "medium"; title: string; detail: string }> = [];
  if (one?.status === "COMPLETED" && seven?.status === "COMPLETED") { const spend = Number(one.metrics.totalCost ?? 0), sales = Number(one.metrics.sales ?? 0), avgSpend = Number(seven.metrics.totalCost ?? 0) / 7, avgSales = Number(seven.metrics.sales ?? 0) / 7; if (spend > avgSpend * 1.5) anomalies.push({ severity: "high", title: "昨日花费明显上升", detail: `比近7天日均高 ${format((spend / Math.max(avgSpend, .01) - 1) * 100, 1)}%` }); if (spend > avgSpend * 1.2 && sales < avgSales * .6) anomalies.push({ severity: "high", title: "花费上升但销售下降", detail: "建议检查高花费Campaign、关键词与搜索词。" }); if (spend > 0 && sales === 0) anomalies.push({ severity: "high", title: "昨日有花费但没有销售", detail: `已产生 ${format(spend)} 花费。` }); }
  const wastedSearchSpend = searchTermInsights.highSpendNoOrder.reduce((sum, item) => sum + Number(item.metrics.totalCost ?? 0), 0); if (wastedSearchSpend > 0) anomalies.push({ severity: "medium", title: "存在高花费零订单搜索词", detail: `近30天榜单中的零订单搜索词合计花费 ${format(wastedSearchSpend)}。` });
  const latestRow = [...syncRows.results].filter(row => Number(row.completedAt ?? 0) > 0).sort((a, b) => Number(b.completedAt ?? 0) - Number(a.completedAt ?? 0))[0];
  const latestRefresh = latestRow ? { completedAt: Number(latestRow.completedAt), type: String(latestRow.triggerType ?? "automatic") === "manual" ? "manual" : "automatic", syncDate: String(latestRow.syncDate ?? "") } : null;
  return { windows, anomalies, keywordInsights, searchTermInsights, reportSyncs: syncRows.results, latestRefresh, generatedAt: Date.now() };
}