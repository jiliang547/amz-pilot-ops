import type { AmazonMcpClient } from "./amazon-mcp";
import { appEnv, d1 } from "./db";
import { summarizeAdsCsv } from "./ads-workflow";

const MAX_REPORT_BYTES = 25 * 1024 * 1024;
const POLL_INTERVAL_MS = 15_000;
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i;

type WorkflowContext = { userId: string; accountId: string; onStatus?: (text: string) => void; timeoutMs?: number; queryText?: string };
type JobRow = { id: string; report_id: string | null; status: string; request_fingerprint: string; error?: string | null };

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
    const normalizedKey = key.replace(/[_-]/g, "").toLowerCase();
    if ((normalizedKey === "reportid" || normalizedKey === "reportids") && (typeof item === "string" || typeof item === "number")) {
      const candidate = String(item).trim();
      if (candidate.length >= 8) ids.add(candidate);
    }
    if (typeof item !== "string") return;
    for (const match of item.matchAll(/(?:\/|\\b)reports?[\\/ ]([A-Za-z0-9._:-]{8,})/gi)) ids.add(match[1]);
    for (const match of item.matchAll(/["']?report[_-]?ids?["']?\s*[:=]\s*["']?([A-Za-z0-9._:-]{8,})/gi)) ids.add(match[1]);
    for (const match of item.matchAll(/\breport\s+ids?\s*(?:is|are|=|:)?\s*["']?([A-Za-z0-9._:-]{8,})/gi)) ids.add(match[1]);
  });
  return [...ids];
}

function mcpCreateError(value: unknown): string | undefined {
  let message: string | undefined;
  walk(value, (key, item) => {
    if (message) return;
    if (key === "isError" && item === true) message = "Amazon MCP 返回了错误";
    if (typeof item !== "string") return;
    const text = item.trim();
    if (!text) return;
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const code = typeof parsed.code === "string" ? parsed.code : undefined;
      const detail = typeof parsed.message === "string" ? parsed.message : undefined;
      if (code || detail) message = [code, detail].filter(Boolean).join(": ");
    } catch { /* ordinary MCP text */ }
    if (!message && /(?:validation failed|field .* cannot|property .* required|must contain exactly one|invalid request)/i.test(text)) message = text;
  });
  return message?.slice(0, 1000);
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

function reportFailure(value: unknown): string | undefined {
  let code: string | undefined, reason: string | undefined;
  walk(value, (key, item) => {
    if (typeof item !== "string") return;
    const normalized = key.replace(/[_-]/g, "").toLowerCase();
    if (normalized === "failurecode") code = item;
    if (normalized === "failurereason") reason = item;
    code ??= item.match(/failure[_-]?code\s*[:=]\s*["']?([^"'\n,}]+)/i)?.[1]?.trim();
    reason ??= item.match(/failure[_-]?reason\s*[:=]\s*["']?([^"'\n,}]+)/i)?.[1]?.trim();
  });
  return [code, reason].filter(Boolean).join(": ") || undefined;
}

function isTransientError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(408|409|425|429|500|502|503|504)\b|timeout|timed out|network|fetch failed|connection reset/i.test(message);
}

function sanitizeSignedUrls(value: unknown): unknown {
  if (typeof value === "string") return value.replace(/https:\/\/[^\s"'<>\\]+/g, "[签名下载地址已由服务端隐藏]");
  if (Array.isArray(value)) return value.map(sanitizeSignedUrls);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizeSignedUrls(item)]));
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

async function callCreateWithRetry(
  client: AmazonMcpClient,
  name: string,
  args: Record<string, unknown>,
  context: WorkflowContext,
): Promise<unknown> {
  const maxAttempts = 8;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await client.callTool(name, args);
    } catch (error) {
      if (!isTransientError(error) || attempt === maxAttempts) throw error;
      const baseDelay = Math.min(60_000, 5_000 * 2 ** (attempt - 1));
      const delay = baseDelay + Math.floor(Math.random() * 1_500);
      context.onStatus?.(
        `Amazon 暂时限流或服务繁忙，创建请求将在 ${Math.ceil(delay / 1000)} 秒后自动重试（${attempt}/${maxAttempts - 1}）`,
      );
      await sleep(delay);
    }
  }
  throw new Error("Amazon 报表创建重试次数已用尽");
}

async function savedResult(job: JobRow, context: WorkflowContext): Promise<unknown | null> {
  if (job.status !== "COMPLETED") return null;
  const files = await d1().prepare(`SELECT part_number partNumber,filename,size,row_count rowCount,summary_json summaryJson,object_key objectKey FROM report_files WHERE report_job_id=? ORDER BY part_number`).bind(job.id).all<Record<string, unknown>>();
  if (!files.results.length) return null;
  const bucket = appEnv().FILES;
  const downloadedReports = [];
  for (const file of files.results) {
    let summary = JSON.parse(String(file.summaryJson));
    if ((!summary.dimensions || context.queryText) && bucket) {
      const object = await bucket.get(String(file.objectKey));
      if (object) {
        summary = summarizeAdsCsv(await object.text(), context.queryText);
        await d1().prepare(`UPDATE report_files SET row_count=?,summary_json=? WHERE report_job_id=? AND part_number=?`).bind(summary.rowCount, JSON.stringify(summary), job.id, file.partNumber).run();
      }
    }
    downloadedReports.push({ part: file.partNumber, filename: file.filename, size: file.size, ...summary });
  }
  return { reportId: job.report_id, status: "COMPLETED", reusedSavedReport: true, downloadedReports, note: "已复用此前完成并私有保存的完整报表汇总；可在报表记录中下载原始 CSV。" };
}

async function upsertJob(context: WorkflowContext, createTool: string, requestFingerprint: string, args: Record<string, unknown>, reportId?: string): Promise<JobRow> {
  const existing = await d1().prepare(`SELECT id,report_id,status,request_fingerprint,error FROM report_jobs WHERE user_id=? AND account_id=? AND request_fingerprint=?`).bind(context.userId, context.accountId, requestFingerprint).first<JobRow>();
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
    const summary = summarizeAdsCsv(csv, context.queryText);
    const part = index + 1;
    const objectKey = `reports/${context.userId}/${context.accountId}/${job.id}/part-${part}.csv`;
    const filename = `amazon-ads-${job.report_id ?? job.id}-part-${part}.csv`;
    await bucket.put(objectKey, bytes, { httpMetadata: { contentType: "text/csv; charset=utf-8" } });
    await d1().prepare(`INSERT INTO report_files(id,report_job_id,part_number,object_key,filename,content_type,size,row_count,summary_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(report_job_id,part_number) DO UPDATE SET object_key=excluded.object_key,filename=excluded.filename,size=excluded.size,row_count=excluded.row_count,summary_json=excluded.summary_json`).bind(crypto.randomUUID(), job.id, part, objectKey, filename, "text/csv; charset=utf-8", bytes.byteLength, summary.rowCount, JSON.stringify(summary), Date.now()).run();
    reports.push({ part, filename, size: bytes.byteLength, ...summary });
  }
  await d1().prepare(`UPDATE report_jobs SET status='COMPLETED',error=NULL,updated_at=?,completed_at=? WHERE id=?`).bind(Date.now(), Date.now(), job.id).run();
  return { amazonResponse: sanitizeSignedUrls(value), reportId: job.report_id, status: "COMPLETED", downloadedReports: reports, note: "aggregates 是服务端对完整 CSV 的汇总；原始 CSV 已私有保存，可从报表记录下载。" };
}

async function pollReport(client: AmazonMcpClient, job: JobRow, context: WorkflowContext): Promise<unknown> {
  if (!job.report_id) throw new Error("Amazon 创建报表响应缺少 reportId，无法安全轮询");
  let poll = 0;
  const startedAt = Date.now();
  while (true) {
    if (context.timeoutMs && Date.now() - startedAt >= context.timeoutMs) {
      // Amazon reporting is asynchronous and larger reports routinely need more
      // time than a single HTTP request can remain open. A polling budget being
      // exhausted is not a report failure: preserve the report id so the agent
      // can resume with reporting-retrieve_report instead of creating a duplicate.
      await d1().prepare(`UPDATE report_jobs SET status='PENDING',error=NULL,updated_at=? WHERE id=?`).bind(Date.now(), job.id).run();
      return {
        reportId: job.report_id,
        status: "PENDING",
        resumeWith: "reporting-retrieve_report",
        note: `报表仍在 Amazon 后台处理中。本次已轮询 ${Math.round(context.timeoutMs / 60_000)} 分钟；请使用同一 reportId 继续查询，不要重新创建报表。`,
      };
    }
    poll++;
    context.onStatus?.(`正在轮询同一个 Report ID（第 ${poll} 次，间隔 15 秒）`);
    let result: unknown;
    try {
      result = await client.callTool("reporting-retrieve_report", { body: { reportIds: [job.report_id] } });
    } catch (error) {
      if (!isTransientError(error)) {
        const message = error instanceof Error ? error.message : String(error);
        await d1().prepare(`UPDATE report_jobs SET error=?,updated_at=? WHERE id=?`).bind(message.slice(0, 1000), Date.now(), job.id).run();
        throw error;
      }
      const retryDelay = Math.min(60_000, POLL_INTERVAL_MS * Math.max(1, Math.ceil(poll / 4)));
      context.onStatus?.(`Amazon 报表状态查询暂时不可用，${Math.round(retryDelay / 1000)} 秒后继续轮询原 Report ID`);
      await sleep(retryDelay);
      continue;
    }
    const state = reportState(result);
    await d1().prepare(`UPDATE report_jobs SET status=?,updated_at=? WHERE id=?`).bind(state === "UNKNOWN" ? "PENDING" : state, Date.now(), job.id).run();
    if (state === "FAILED" || state === "CANCELLED") {
      const detail = reportFailure(result) ?? JSON.stringify(sanitizeSignedUrls(result)).slice(0, 1200);
      const error = `Amazon 报表状态为 ${state}${detail ? `：${detail}` : ""}`;
      await d1().prepare(`UPDATE report_jobs SET error=?,updated_at=? WHERE id=?`).bind(error, Date.now(), job.id).run();
      throw new Error(error);
    }
    if (state === "COMPLETED") {
      if (!reportUrls(result).length) {
        context.onStatus?.("报表状态已完成，正在等待 Amazon 返回下载文件");
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      try {
        return await downloadAndPersist(job, result, context);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await d1().prepare(`UPDATE report_jobs SET status='DOWNLOAD_FAILED',error=?,updated_at=? WHERE id=?`).bind(message.slice(0, 1000), Date.now(), job.id).run();
        throw error;
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

export function prepareReportToolArgs(name: string, args: Record<string, unknown>): Record<string, unknown> {
  // Campaign reports require the query object, but their schema does not accept
  // query.fields. Keep the required empty object and remove only its properties.
  if (name === "reporting-create_campaign_report") {
    const body = { ...((args.body as Record<string, unknown>) ?? {}) };
    if (Array.isArray(body.reports)) {
      body.reports = body.reports.map(report => {
        if (!report || typeof report !== "object") return report;
        const copy = { ...(report as Record<string, unknown>) };
        copy.query = {};
        return copy;
      });
    }
    return { ...args, body };
  }
  return args;
}

export async function executeReportTool(client: AmazonMcpClient, name: string, args: Record<string, unknown>, context: WorkflowContext): Promise<unknown> {
  args = prepareReportToolArgs(name, args);
  if (name === "reporting-retrieve_report") {
    const ids = extractReportIds(args);
    if (!ids.length) return client.callTool(name, args);
    const requestFingerprint = await fingerprint(name, { reportId: ids[0] });
    const job = await upsertJob(context, name, requestFingerprint, args, ids[0]);
    const saved = await savedResult(job, context); if (saved) return saved;
    return pollReport(client, job, context);
  }
  const requestFingerprint = await fingerprint(name, args);
  let job = await upsertJob(context, name, requestFingerprint, args);
  const saved = await savedResult(job, context); if (saved) { context.onStatus?.("发现相同条件的已完成报表，直接复用私有保存结果"); return saved; }
  if (job.report_id && !["FAILED", "CANCELLED"].includes(job.status)) { context.onStatus?.("发现相同条件的已有报表，继续轮询原 Report ID"); return pollReport(client, job, context); }
  if (!job.report_id && job.status === "CREATE_UNCERTAIN") {
    const recoveredReportId = job.error ? extractReportIds(job.error)[0] : undefined;
    if (recoveredReportId) {
      job = await upsertJob(context, name, requestFingerprint, args, recoveredReportId);
      context.onStatus?.(`已从此前保存的创建响应恢复 Report ID ${recoveredReportId}，继续轮询`);
      return pollReport(client, job, context);
    }
    throw new Error("此前相同条件的报表创建结果不确定，系统已阻止自动重建；请在报表记录中查看错误详情。");
  }
  let created: unknown;
  try {
    created = await callCreateWithRetry(client, name, args, context);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await d1().prepare(`UPDATE report_jobs SET status='CREATE_FAILED',error=?,updated_at=? WHERE id=?`).bind(message.slice(0, 1000), Date.now(), job.id).run();
    throw error;
  }
  const toolError = mcpCreateError(created);
  if (toolError) {
    await d1().prepare(`UPDATE report_jobs SET status='CREATE_FAILED',error=?,updated_at=? WHERE id=?`).bind(toolError, Date.now(), job.id).run();
    throw new Error(`Amazon 报表创建请求被拒绝：${toolError}`);
  }
  const reportId = extractReportIds(created)[0];
  if (!reportId) {
    const detail = JSON.stringify(sanitizeSignedUrls(created)).slice(0, 1200);
    await d1().prepare(`UPDATE report_jobs SET status='CREATE_UNCERTAIN',error=?,updated_at=? WHERE id=?`).bind(`未能从创建响应提取 reportId：${detail}`, Date.now(), job.id).run();
    throw new Error("Amazon 已返回创建响应，但服务端未能识别 reportId。为避免重复创建，本次不会自动重发；错误详情已保存。");
  }
  job = await upsertJob(context, name, requestFingerprint, args, reportId);
  return pollReport(client, job, context);
}
