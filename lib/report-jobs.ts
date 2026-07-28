import type { AmazonMcpClient } from "./amazon-mcp";
import { appEnv, d1 } from "./db";

const MAX_REPORT_BYTES = 25 * 1024 * 1024;
const POLL_INTERVAL_MS = 15_000;
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i;

type WorkflowContext = { userId: string; accountId: string; onStatus?: (text: string) => void };
type JobRow = { id: string; report_id: string | null; status: string; request_fingerprint: string };

function walk(value: unknown, visitor: (key: string, value: unknown) => void, key = ""): void {
  visitor(key, value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && trimmed.length < 2_000_000) {
      try { walk(JSON.parse(trimmed), visitor, key); } catch { /* non-JSON MCP text */ }
    }
  } else if (Array.isArray(value)) value.forEach(item => walk(item, visitor, key));
  else if (value && typeof value === "object") for (const [childKey, item] of Object.entries(value as Record<string, unknown>)) walk(item, visitor, childKey);
}

export function extractReportIds(value: unknown): string[] {
  const ids = new Set<string>();
  walk(value, (key, item) => {
    if (typeof item === "string" && key.replace(/[_-]/g, "").toLowerCase() === "reportid" && item.trim()) ids.add(item.trim());
  });
  return [...ids];
}

function reportUrls(value: unknown): string[] {
  const urls = new Set<string>();
  walk(value, (_key, item) => {
    if (typeof item !== "string") return;
    for (const match of item.matchAll(/https:\/\/[^\s"'<>\\]+/g)) urls.add(match[0].replace(/[),.;]+$/, ""));
  });
  return [...urls].filter(raw => { try { const url = new URL(raw); return url.protocol === "https:" && !PRIVATE_HOST.test(url.hostname); } catch { return false; } });
}

function reportState(value: unknown): "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED" | "UNKNOWN" {
  if (reportUrls(value).length) return "COMPLETED";
  const text = JSON.stringify(value);
  if (/\bFAILED\b/i.test(text)) return "FAILED";
  if (/\bCANCELLED\b/i.test(text)) return "CANCELLED";
  if (/\bCOMPLETED\b/i.test(text)) return "COMPLETED";
  if (/\b(PENDING|IN_PROGRESS|PROCESSING)\b/i.test(text)) return "PENDING";
  return "UNKNOWN";
}

function sanitizeSignedUrls(value: unknown): unknown {
  if (typeof value === "string") return value.replace(/https:\/\/[^\s"'<>\\]+/g, "[签名下载地址已由服务端隐藏]");
  if (Array.isArray(value)) return value.map(sanitizeSignedUrls);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizeSignedUrls(item)]));
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = []; let value = "", quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"') { if (quoted && line[index + 1] === '"') { value += '"'; index++; } else quoted = !quoted; }
    else if (character === "," && !quoted) { cells.push(value); value = ""; } else value += character;
  }
  cells.push(value); return cells;
}

function summarizeCsv(csv: string) {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { rowCount: 0, columns: [], aggregates: {} };
  const headers = parseCsvLine(lines[0]);
  const normalized = headers.map(header => header.toLowerCase().replace(/[\s_]/g, ""));
  const metrics: Record<string, string[]> = { totalCost: ["metric.totalcost", "totalcost", "spend", "cost"], sales: ["metric.sales", "sales"], clicks: ["metric.clicks", "clicks"], impressions: ["metric.impressions", "impressions"], purchases: ["metric.purchases", "purchases"], unitsSold: ["metric.unitssold", "unitssold"] };
  const indexes = Object.fromEntries(Object.entries(metrics).map(([key, names]) => [key, normalized.findIndex(header => names.some(name => header === name || header.endsWith(name)))]));
  const aggregates: Record<string, number> = {};
  for (const key of Object.keys(metrics)) aggregates[key] = 0;
  for (let index = 1; index < lines.length; index++) {
    const cells = parseCsvLine(lines[index]);
    for (const [key, column] of Object.entries(indexes)) if (column >= 0) { const numeric = Number((cells[column] ?? "").replace(/[$€£¥%\s,]/g, "")); if (Number.isFinite(numeric)) aggregates[key] += numeric; }
  }
  for (const key of Object.keys(aggregates)) if (indexes[key] < 0) delete aggregates[key];
  return { rowCount: Math.max(0, lines.length - 1), columns: headers, aggregates };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

async function fingerprint(name: string, args: Record<string, unknown>): Promise<string> {
  const bytes = new TextEncoder().encode(`${name}:${stable(args)}`);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function savedResult(job: JobRow): Promise<unknown | null> {
  if (job.status !== "COMPLETED") return null;
  const files = await d1().prepare(`SELECT part_number partNumber,filename,size,row_count rowCount,summary_json summaryJson FROM report_files WHERE report_job_id=? ORDER BY part_number`).bind(job.id).all<Record<string, unknown>>();
  if (!files.results.length) return null;
  return { reportId: job.report_id, status: "COMPLETED", reusedSavedReport: true, downloadedReports: files.results.map(file => ({ part: file.partNumber, filename: file.filename, size: file.size, ...JSON.parse(String(file.summaryJson)) })), note: "已复用此前完成并私有保存的完整报表汇总；可在报表记录中下载原始 CSV。" };
}

async function upsertJob(context: WorkflowContext, createTool: string, requestFingerprint: string, args: Record<string, unknown>, reportId?: string): Promise<JobRow> {
  const existing = await d1().prepare(`SELECT id,report_id,status,request_fingerprint FROM report_jobs WHERE user_id=? AND account_id=? AND request_fingerprint=?`).bind(context.userId, context.accountId, requestFingerprint).first<JobRow>();
  const now = Date.now();
  if (existing) {
    if (reportId && (existing.status === "FAILED" || existing.status === "CANCELLED" || !existing.report_id)) {
      await d1().prepare(`UPDATE report_jobs SET report_id=?,status='PENDING',error=NULL,updated_at=? WHERE id=?`).bind(reportId, now, existing.id).run();
      return { ...existing, report_id: reportId, status: "PENDING" };
    }
    return existing;
  }
  const id = crypto.randomUUID();
  await d1().prepare(`INSERT INTO report_jobs(id,user_id,account_id,report_id,create_tool,request_fingerprint,request_args,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(id, context.userId, context.accountId, reportId ?? null, createTool, requestFingerprint, JSON.stringify(args), "PENDING", now, now).run();
  return { id, report_id: reportId ?? null, status: "PENDING", request_fingerprint: requestFingerprint };
}

async function downloadAndPersist(job: JobRow, value: unknown, context: WorkflowContext): Promise<unknown> {
  const urls = reportUrls(value);
  if (!urls.length) throw new Error("Amazon 报表已完成，但未返回可下载文件地址");
  const bucket = appEnv().FILES;
  if (!bucket) throw new Error("报表私有存储尚未配置");
  context.onStatus?.(`报表已完成，正在下载并私有保存 ${urls.length} 个 CSV 文件`);
  const reports = [];
  for (let index = 0; index < urls.length; index++) {
    const response = await fetch(urls[index], { redirect: "follow" });
    if (!response.ok) throw new Error(`Amazon 报表下载失败 (${response.status})`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_REPORT_BYTES) throw new Error("Amazon 单个报表超过 25MB，暂时无法保存和分析");
    const csv = new TextDecoder().decode(bytes);
    const summary = summarizeCsv(csv);
    const part = index + 1;
    const objectKey = `reports/${context.userId}/${context.accountId}/${job.id}/part-${part}.csv`;
    const filename = `amazon-ads-${job.report_id ?? job.id}-part-${part}.csv`;
    await bucket.put(objectKey, bytes, { httpMetadata: { contentType: "text/csv; charset=utf-8" } });
    await d1().prepare(`INSERT INTO report_files(id,report_job_id,part_number,object_key,filename,content_type,size,row_count,summary_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(report_job_id,part_number) DO UPDATE SET object_key=excluded.object_key,filename=excluded.filename,size=excluded.size,row_count=excluded.row_count,summary_json=excluded.summary_json`).bind(crypto.randomUUID(), job.id, part, objectKey, filename, "text/csv; charset=utf-8", bytes.byteLength, summary.rowCount, JSON.stringify(summary), Date.now()).run();
    reports.push({ part, filename, size: bytes.byteLength, ...summary, csvPreview: csv.slice(0, 30_000), previewTruncated: csv.length > 30_000 });
  }
  await d1().prepare(`UPDATE report_jobs SET status='COMPLETED',error=NULL,updated_at=?,completed_at=? WHERE id=?`).bind(Date.now(), Date.now(), job.id).run();
  return { amazonResponse: sanitizeSignedUrls(value), reportId: job.report_id, status: "COMPLETED", downloadedReports: reports, note: "aggregates 是服务端对完整 CSV 的汇总；原始 CSV 已私有保存，可从报表记录下载。" };
}

async function pollReport(client: AmazonMcpClient, job: JobRow, context: WorkflowContext): Promise<unknown> {
  if (!job.report_id) throw new Error("Amazon 创建报表响应缺少 reportId，无法安全轮询");
  let poll = 0;
  while (true) {
    poll++;
    context.onStatus?.(`正在轮询同一个 Report ID（第 ${poll} 次，间隔 15 秒）`);
    const result = await client.callTool("reporting-retrieve_report", { body: { reportIds: [job.report_id] } });
    const state = reportState(result);
    await d1().prepare(`UPDATE report_jobs SET status=?,updated_at=? WHERE id=?`).bind(state === "UNKNOWN" ? "PENDING" : state, Date.now(), job.id).run();
    if (state === "FAILED" || state === "CANCELLED") {
      const error = `Amazon 报表状态为 ${state}`;
      await d1().prepare(`UPDATE report_jobs SET error=?,updated_at=? WHERE id=?`).bind(error, Date.now(), job.id).run();
      throw new Error(error);
    }
    if (state === "COMPLETED") return downloadAndPersist(job, result, context);
    await sleep(POLL_INTERVAL_MS);
  }
}

export async function executeReportTool(client: AmazonMcpClient, name: string, args: Record<string, unknown>, context: WorkflowContext): Promise<unknown> {
  if (name === "reporting-retrieve_report") {
    const ids = extractReportIds(args);
    if (!ids.length) return client.callTool(name, args);
    const requestFingerprint = await fingerprint(name, { reportId: ids[0] });
    const job = await upsertJob(context, name, requestFingerprint, args, ids[0]);
    const saved = await savedResult(job); if (saved) return saved;
    return pollReport(client, job, context);
  }
  const requestFingerprint = await fingerprint(name, args);
  let job = await upsertJob(context, name, requestFingerprint, args);
  const saved = await savedResult(job); if (saved) { context.onStatus?.("发现相同条件的已完成报表，直接复用私有保存结果"); return saved; }
  if (job.report_id && job.status === "PENDING") { context.onStatus?.("发现相同条件的未完成报表，继续轮询原 Report ID"); return pollReport(client, job, context); }
  const created = await client.callTool(name, args);
  const reportId = extractReportIds(created)[0];
  if (!reportId) throw new Error("Amazon 创建报表响应没有 reportId；为避免重复创建，已终止并保留响应供排查");
  job = await upsertJob(context, name, requestFingerprint, args, reportId);
  return pollReport(client, job, context);
}
