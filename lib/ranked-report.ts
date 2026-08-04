import { d1 } from "./db";
import type { AmazonCredentials } from "./amazon-mcp";
import { AmazonMcpClient } from "./amazon-mcp";
import { executeReportTool } from "./report-jobs";

export type RankedReportResult = { type: "answer"; content: string; accountId: string; modelRounds: 0; rankedReport: true };
type Range = { startDate: string; endDate: string; label: string; includesToday: boolean };
type Group = { campaignId?: string; campaignName?: string; aggregates?: Record<string, number> };

const RANKING = /最高|最低|最多|最少|第一|top\s*\d*|排名|排行|哪个|哪一个/i;
const CAMPAIGN = /campaign|广告活动|活动/i;
const METRIC = /花费|消耗|支出|spend|cost|销售额|sales|点击|click|曝光|impression|订单|购买|purchase|acos|roas|ctr/i;
const DATE = /今天|今日|昨天|昨日|本月|这个月|最近|近\s*\d|过去\s*\d|today|yesterday|last\s*\d/i;

const MUTATION = /鍒涘缓|鏂板缓|娣诲姞|淇敼|鏇存柊|璋冩暣|鏆傚仠|鍚敤|鍒犻櫎|褰掓。|涓嬭皟|涓婅皟|鎻愰珮|闄嶄綆|鎵€鏈夌鍚?|批量|create|update|pause|enable|delete|archive|lower|raise|adjust/i;
export function isRankedCampaignReport(message: string): boolean {
  return RANKING.test(message) && CAMPAIGN.test(message) && METRIC.test(message) && DATE.test(message) && !MUTATION.test(message);
}

function localDate(timezone: string, offsetDays: number): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + offsetDays)).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function rangeFor(message: string, timezone: string): Range | null {
  if (/今天|今日|today/i.test(message)) { const date = localDate(timezone, 0); return { startDate: date, endDate: date, label: `${date}（今天）`, includesToday: true }; }
  if (/昨天|昨日|yesterday/i.test(message)) { const date = localDate(timezone, -1); return { startDate: date, endDate: date, label: `${date}（昨天）`, includesToday: false }; }
  if (/本月|这个月/i.test(message)) { const endDate = localDate(timezone, 0); return { startDate: `${endDate.slice(0, 8)}01`, endDate, label: `${endDate.slice(0, 7)} 本月至今`, includesToday: true }; }
  const match = message.match(/最近\s*(\d{1,3})\s*天/i) ?? message.match(/近\s*(\d{1,3})\s*天/i) ?? message.match(/过去\s*(\d{1,3})\s*天/i) ?? message.match(/last\s*(\d{1,3})\s*days?/i);
  if (!match) return null;
  const days = Math.max(1, Math.min(90, Number(match[1] ?? match[2])));
  const includesToday = /包含今天|含今天|including\s*today/i.test(message);
  const endDate = localDate(timezone, includesToday ? 0 : -1);
  return { startDate: addDays(endDate, -(days - 1)), endDate, label: `${addDays(endDate, -(days - 1))} 至 ${endDate}`, includesToday };
}

function currencyFor(row: Record<string, unknown>): string {
  if (row.currency) return String(row.currency).toUpperCase();
  const marketplace = String(row.marketplace ?? "").toUpperCase();
  return ({ US: "USD", CA: "CAD", MX: "MXN", UK: "GBP", DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", JP: "JPY", AU: "AUD" } as Record<string, string>)[marketplace] ?? "USD";
}

function metricFor(message: string): { key: string; label: string; derived?: "acos" | "roas" | "ctr" } {
  if (/acos/i.test(message)) return { key: "acos", label: "ACOS", derived: "acos" };
  if (/roas/i.test(message)) return { key: "roas", label: "ROAS", derived: "roas" };
  if (/ctr/i.test(message)) return { key: "ctr", label: "CTR", derived: "ctr" };
  if (/销售额|sales/i.test(message)) return { key: "sales", label: "广告销售额" };
  if (/点击|click/i.test(message)) return { key: "clicks", label: "点击" };
  if (/曝光|impression/i.test(message)) return { key: "impressions", label: "曝光" };
  if (/订单|购买|purchase/i.test(message)) return { key: "purchases", label: "购买" };
  return { key: "totalCost", label: "花费" };
}

function valueFor(group: Group, metric: ReturnType<typeof metricFor>): number | undefined {
  const values = group.aggregates ?? {};
  if (metric.derived === "acos") return values.sales > 0 ? values.totalCost / values.sales * 100 : undefined;
  if (metric.derived === "roas") return values.totalCost > 0 ? values.sales / values.totalCost : undefined;
  if (metric.derived === "ctr") return values.impressions > 0 ? values.clicks / values.impressions * 100 : undefined;
  const value = values[metric.key]; return Number.isFinite(value) ? value : undefined;
}

function mergeGroups(result: unknown): Group[] {
  const files = result && typeof result === "object" ? (result as { downloadedReports?: unknown }).downloadedReports : undefined;
  if (!Array.isArray(files)) return [];
  const merged = new Map<string, Group>();
  for (const file of files) {
    if (!file || typeof file !== "object" || !Array.isArray((file as { groups?: unknown }).groups)) continue;
    for (const raw of (file as { groups: Group[] }).groups) {
      const key = raw.campaignId || raw.campaignName; if (!key) continue;
      const current = merged.get(key) ?? { campaignId: raw.campaignId, campaignName: raw.campaignName, aggregates: {} };
      for (const [metric, value] of Object.entries(raw.aggregates ?? {})) if (Number.isFinite(value)) current.aggregates![metric] = (current.aggregates![metric] ?? 0) + value;
      merged.set(key, current);
    }
  }
  return [...merged.values()];
}

function format(value: number, percentage: boolean): string {
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2, minimumFractionDigits: percentage ? 2 : 0 }).format(value)}${percentage ? "%" : ""}`;
}

export async function tryRankedCampaignReport(options: { userId: string; message: string; row: Record<string, unknown>; credentials: AmazonCredentials; onStatus?: (text: string) => void }): Promise<RankedReportResult | null> {
  const { userId, message, row, credentials, onStatus } = options;
  if (!isRankedCampaignReport(message)) return null;
  const timezone = String(row.timezone ?? ""); const advertiserAccountId = String(row.advertiser_account_id ?? "");
  if (!timezone || !advertiserAccountId) return null;
  const range = rangeFor(message, timezone); if (!range) return null;
  const currency = currencyFor(row); credentials.advertiserAccountId = advertiserAccountId;
  onStatus?.("已识别为 Campaign 排名查询：正在创建并等待完整报表，随后由后端分组排序");
  const result = await executeReportTool(new AmazonMcpClient(credentials, "DYNAMIC"), "reporting-create_campaign_report", { body: { reports: [{ currencyOfView: currency, format: "CSV", periods: [{ datePeriod: { startDate: range.startDate, endDate: range.endDate } }] }] } }, { userId, accountId: String(row.id), onStatus });
  const metric = metricFor(message); const descending = !/最低|最少/i.test(message);
  const ranked = mergeGroups(result).map(group => ({ group, value: valueFor(group, metric) })).filter((item): item is { group: Group; value: number } => typeof item.value === "number" && Number.isFinite(item.value)).sort((a, b) => descending ? b.value - a.value : a.value - b.value);
  if (!ranked.length) throw new Error("报表已完成，但 CSV 中没有可用于 Campaign 排名的 campaign.id、campaign.name 或目标指标字段");
  const winner = ranked[0]; const percentage = Boolean(metric.derived); const unit = percentage || !["totalCost","sales"].includes(metric.key) ? "" : ` ${currency}`;
  const top = ranked.slice(0, Math.min(5, ranked.length)).map((item, index) => `${index + 1}. ${item.group.campaignName || "未命名 Campaign"}（ID ${item.group.campaignId || "未知"}）：${format(item.value, percentage)}${unit}`).join("\n");
  const content = `已由 Campaign 排名 Skill 完成报表创建、轮询、CSV 下载、分组与排序，没有调用大模型。\n\n日期：${range.label}\n账户时区：${timezone}\n${descending ? "最高" : "最低"}${metric.label}的广告活动：${winner.group.campaignName || "未命名 Campaign"}\nCampaign ID：${winner.group.campaignId || "未知"}\n${metric.label}：${format(winner.value, percentage)}${unit}\n\n前 ${Math.min(5, ranked.length)} 名：\n${top}${range.includesToday ? "\n\n提示：今天的数据可能仍在归因和回传中。" : ""}`;
  await d1().prepare(`INSERT INTO audit_logs(id,user_id,account_id,action,target,detail,outcome,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), userId, row.id, "report.rank_campaign", "reporting-create_campaign_report", JSON.stringify({ startDate: range.startDate, endDate: range.endDate, metric: metric.key, descending }), "success", Date.now()).run();
  return { type: "answer", content, accountId: String(row.id), modelRounds: 0, rankedReport: true };
}
