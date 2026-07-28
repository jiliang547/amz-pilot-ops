import { d1 } from "./db";
import type { AmazonCredentials } from "./amazon-mcp";
import { AmazonMcpClient } from "./amazon-mcp";
import { executeReportTool } from "./report-jobs";

export type FastReportResult = {
  type: "answer";
  content: string;
  accountId: string;
  modelRounds: 0;
  fastPath: true;
};

type DateRange = { startDate: string; endDate: string; label: string; includesToday: boolean };
type ReportSummary = { rowCount?: number; aggregates?: Record<string, number> };

const BLOCKED_DETAIL = /搜索词|关键词|keyword|search\s*term|asin|广告组|ad\s*group|campaign|活动|逐个|明细|列表|排名|哪些|最高|最低|优化|建议|诊断|原因|趋势|对比|同比|环比|创建|修改|调整|暂停|启用|否定/i;
const REPORT_METRIC = /花费|消耗|支出|spend|cost|销售额|sales|点击|click|曝光|impression|订单|购买|purchase|acos|roas|ctr|转化率|表现|数据/i;
const READ_INTENT = /查|查询|多少|总额|总计|汇总|统计|看看|看下|给我|显示|report/i;

function dateInZone(timezone: string, offsetDays: number): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return new Date(Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day) + offsetDays)).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function reportRange(message: string, timezone: string): DateRange | null {
  if (/今天|今日|当日|today/i.test(message)) {
    const date = dateInZone(timezone, 0);
    return { startDate: date, endDate: date, label: `${date}（今天）`, includesToday: true };
  }
  if (/昨天|昨日|yesterday/i.test(message)) {
    const date = dateInZone(timezone, -1);
    return { startDate: date, endDate: date, label: `${date}（昨天）`, includesToday: false };
  }
  if (/本月|这个月|当月|this\s*month/i.test(message)) {
    const endDate = dateInZone(timezone, 0);
    return { startDate: `${endDate.slice(0, 8)}01`, endDate, label: `${endDate.slice(0, 7)} 本月至今`, includesToday: true };
  }
  const daysMatch = message.match(/(?:最近|近|过去)\s*(\d{1,3})\s*(?:天|日)|last\s*(\d{1,3})\s*days?/i);
  if (daysMatch) {
    const days = Math.max(1, Math.min(90, Number(daysMatch[1] ?? daysMatch[2])));
    const includesToday = /包含今天|含今天|including\s*today/i.test(message);
    const endDate = dateInZone(timezone, includesToday ? 0 : -1);
    const startDate = addDays(endDate, -(days - 1));
    return { startDate, endDate, label: `${startDate} 至 ${endDate}${includesToday ? "（含今天）" : "（完整自然日）"}`, includesToday };
  }
  return null;
}

export function isFastAggregateReport(message: string): boolean {
  return READ_INTENT.test(message) && REPORT_METRIC.test(message) && !BLOCKED_DETAIL.test(message) && /今天|今日|当日|昨天|昨日|本月|这个月|当月|最近|近\s*\d|过去\s*\d|today|yesterday|last\s*\d/i.test(message);
}

function currencyFor(row: Record<string, unknown>): string {
  if (row.currency) return String(row.currency).toUpperCase();
  const marketplace = String(row.marketplace ?? "").toUpperCase();
  return ({ US: "USD", CA: "CAD", MX: "MXN", UK: "GBP", DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", JP: "JPY", AU: "AUD" } as Record<string, string>)[marketplace] ?? "USD";
}

function collectSummaries(value: unknown): ReportSummary[] {
  if (!value || typeof value !== "object") return [];
  const reports = (value as { downloadedReports?: unknown }).downloadedReports;
  if (!Array.isArray(reports)) return [];
  return reports.filter(item => item && typeof item === "object") as ReportSummary[];
}

function total(summaries: ReportSummary[], key: string): number | undefined {
  const values = summaries.map(summary => summary.aggregates?.[key]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length ? values.reduce((sum, value) => sum + value, 0) : undefined;
}

function number(value: number, digits = 2): string {
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function answerFor(message: string, range: DateRange, timezone: string, currency: string, summaries: ReportSummary[]): string {
  const spend = total(summaries, "totalCost"), sales = total(summaries, "sales"), clicks = total(summaries, "clicks"), impressions = total(summaries, "impressions"), purchases = total(summaries, "purchases"), units = total(summaries, "unitsSold");
  const rows = summaries.reduce((sum, summary) => sum + (summary.rowCount ?? 0), 0);
  const broad = /表现|数据|汇总|全部|整体|acos|roas|ctr|转化率/i.test(message);
  const lines: string[] = [];
  if (spend !== undefined) lines.push(`花费：${number(spend)} ${currency}`);
  if (broad || /销售额|sales/i.test(message)) if (sales !== undefined) lines.push(`广告销售额：${number(sales)} ${currency}`);
  if (broad || /点击|click/i.test(message)) if (clicks !== undefined) lines.push(`点击：${number(clicks, 0)}`);
  if (broad || /曝光|impression/i.test(message)) if (impressions !== undefined) lines.push(`曝光：${number(impressions, 0)}`);
  if (broad || /订单|购买|purchase/i.test(message)) if (purchases !== undefined) lines.push(`购买：${number(purchases, 0)}`);
  if (broad && units !== undefined) lines.push(`售出件数：${number(units, 0)}`);
  if ((broad || /acos/i.test(message)) && spend !== undefined && sales !== undefined) lines.push(`ACOS：${sales > 0 ? number(spend / sales * 100) : "—"}%`);
  if ((broad || /roas/i.test(message)) && spend !== undefined && sales !== undefined) lines.push(`ROAS：${spend > 0 ? number(sales / spend) : "—"}`);
  if ((broad || /ctr/i.test(message)) && clicks !== undefined && impressions !== undefined) lines.push(`CTR：${impressions > 0 ? number(clicks / impressions * 100) : "—"}%`);
  if ((broad || /转化率/i.test(message)) && purchases !== undefined && clicks !== undefined) lines.push(`转化率：${clicks > 0 ? number(purchases / clicks * 100) : "—"}%`);
  if (!lines.length) lines.push("报表已完成，但请求的指标没有出现在返回字段中。");
  return `已由后端直接完成 Amazon 报表下载与完整 CSV 汇总，没有调用大模型。\n\n日期：${range.label}\n账户时区：${timezone}\n${lines.join("\n")}\n报表数据行：${rows}${range.includesToday ? "\n\n提示：今天的数据可能仍在归因和回传中，最终金额可能继续变化。" : ""}`;
}

export async function tryFastAggregateReport(options: {
  userId: string;
  message: string;
  row: Record<string, unknown>;
  credentials: AmazonCredentials;
  onStatus?: (text: string) => void;
}): Promise<FastReportResult | null> {
  const { userId, message, row, credentials, onStatus } = options;
  if (!isFastAggregateReport(message)) return null;
  const marketplace = String(row.marketplace ?? "").toUpperCase();
  const timezone = String(row.timezone ?? ({ US: "America/Los_Angeles", UK: "Europe/London", DE: "Europe/Berlin", FR: "Europe/Paris", IT: "Europe/Rome", ES: "Europe/Madrid", JP: "Asia/Tokyo", AU: "Australia/Sydney" } as Record<string, string>)[marketplace] ?? "");
  if (!timezone || !row.advertiser_account_id) return null;
  const range = reportRange(message, timezone);
  if (!range) return null;
  const currency = currencyFor(row);
  credentials.advertiserAccountId = String(row.advertiser_account_id);
  const client = new AmazonMcpClient(credentials, "DYNAMIC");
  onStatus?.("已识别为标准指标查询：后端直接创建、轮询并汇总报表，不调用大模型");
  const result = await executeReportTool(client, "reporting-create_campaign_report", {
    body: {
      reports: [{
        currencyOfView: currency,
        format: "CSV",
        periods: [{ datePeriod: { startDate: range.startDate, endDate: range.endDate } }],
      }],
    },
  }, { userId, accountId: String(row.id), onStatus });
  const summaries = collectSummaries(result);
  const content = answerFor(message, range, timezone, currency, summaries);
  await d1().prepare(`INSERT INTO audit_logs(id,user_id,account_id,action,target,detail,outcome,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), userId, row.id, "report.fast_path", "reporting-create_campaign_report", JSON.stringify({ startDate: range.startDate, endDate: range.endDate, currency }), "success", Date.now()).run();
  return { type: "answer", content, accountId: String(row.id), modelRounds: 0, fastPath: true };
}
