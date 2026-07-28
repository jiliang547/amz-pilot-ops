const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i;
const MAX_REPORT_BYTES = 10 * 1024 * 1024;

function visit(value: unknown, urls: Set<string>): void {
  if (typeof value === "string") {
    for (const match of value.matchAll(/https:\/\/[^\s"'<>\\]+/g)) urls.add(match[0].replace(/[),.;]+$/, ""));
    if ((value.startsWith("{") || value.startsWith("[")) && value.length < 2_000_000) {
      try { visit(JSON.parse(value), urls); } catch { /* MCP text does not always contain JSON. */ }
    }
    return;
  }
  if (Array.isArray(value)) { for (const item of value) visit(item, urls); return; }
  if (value && typeof value === "object") for (const item of Object.values(value as Record<string, unknown>)) visit(item, urls);
}

function reportUrls(value: unknown): string[] {
  const urls = new Set<string>();
  visit(value, urls);
  return [...urls].filter(raw => {
    try {
      const url = new URL(raw);
      return url.protocol === "https:" && !PRIVATE_HOST.test(url.hostname);
    } catch { return false; }
  });
}

export function reportIsPending(value: unknown): boolean {
  const text = JSON.stringify(value);
  return /\bPENDING\b/i.test(text) && !/\b(COMPLETED|FAILED|CANCELLED)\b/i.test(text) && reportUrls(value).length === 0;
}

function sanitizeSignedUrls(value: unknown): unknown {
  if (typeof value === "string") return value.replace(/https:\/\/[^\s"'<>\\]+/g, "[签名下载地址已由服务端隐藏]");
  if (Array.isArray(value)) return value.map(sanitizeSignedUrls);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizeSignedUrls(item)]));
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = "", quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index++; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { cells.push(value); value = ""; }
    else value += character;
  }
  cells.push(value);
  return cells;
}

function numberValue(value: string | undefined): number {
  if (!value) return 0;
  const normalized = value.replace(/[$€£¥,%\s]/g, "").replace(/,/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function findColumn(headers: string[], names: string[]): number {
  const normalized = headers.map(header => header.toLowerCase().replace(/[\s_]/g, ""));
  return normalized.findIndex(header => names.some(name => header === name || header.endsWith(name)));
}

function summarizeCsv(csv: string) {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { rowCount: 0, columns: [], aggregates: {} };
  const headers = parseCsvLine(lines[0]);
  const metrics: Record<string, string[]> = {
    totalCost: ["metric.totalcost", "totalcost", "spend", "cost"],
    sales: ["metric.sales", "sales"],
    clicks: ["metric.clicks", "clicks"],
    impressions: ["metric.impressions", "impressions"],
    purchases: ["metric.purchases", "purchases"],
    unitsSold: ["metric.unitssold", "unitssold"],
  };
  const indexes = Object.fromEntries(Object.entries(metrics).map(([key, names]) => [key, findColumn(headers, names)]));
  const aggregates: Record<string, number> = {};
  for (const key of Object.keys(metrics)) aggregates[key] = 0;
  for (let index = 1; index < lines.length; index++) {
    const cells = parseCsvLine(lines[index]);
    for (const [key, column] of Object.entries(indexes)) if (column >= 0) aggregates[key] += numberValue(cells[column]);
  }
  for (const key of Object.keys(aggregates)) if (indexes[key] < 0) delete aggregates[key];
  return { rowCount: Math.max(0, lines.length - 1), columns: headers, aggregates };
}

async function downloadCsv(rawUrl: string, part: number) {
  const response = await fetch(rawUrl, { redirect: "follow" });
  if (!response.ok) throw new Error(`Amazon 报表下载失败 (${response.status})`);
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_REPORT_BYTES) throw new Error("Amazon 报表超过 10MB，暂时无法在单次对话中分析");
  const csv = await response.text();
  if (new TextEncoder().encode(csv).byteLength > MAX_REPORT_BYTES) throw new Error("Amazon 报表超过 10MB，暂时无法在单次对话中分析");
  return { part, ...summarizeCsv(csv), csvPreview: csv.slice(0, 30_000), previewTruncated: csv.length > 30_000 };
}

export async function enrichReportResult(value: unknown, onStatus?: (text: string) => void): Promise<unknown> {
  const urls = reportUrls(value);
  if (!urls.length) return sanitizeSignedUrls(value);
  onStatus?.(`报表已完成，正在安全下载并汇总 ${urls.length} 个 CSV 文件`);
  const reports = [];
  for (let index = 0; index < urls.length; index++) reports.push(await downloadCsv(urls[index], index + 1));
  return { amazonResponse: sanitizeSignedUrls(value), downloadedReports: reports, note: "aggregates 是服务端对完整 CSV 的汇总；csvPreview 仅用于核对字段，不代表全部数据。" };
}