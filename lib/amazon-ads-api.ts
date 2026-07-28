import { appEnv, d1 } from "./db";
import type { AmazonCredentials } from "./amazon-mcp";

type ReportStatus = {
  reportId: string;
  status: string;
  failureReason?: string | null;
  url?: string | null;
};

type Metrics = Record<string, number>;
type Group = { campaignId?: string; campaignName?: string; aggregates: Metrics };
export type AdsReportSummary = { aggregates: Metrics; groups: Group[]; rowCount: number };

const REPORT_COLUMNS = [
  "date", "campaignId", "campaignName", "adGroupId", "adGroupName",
  "impressions", "clicks", "cost", "purchases14d", "sales14d",
];

function apiBase(region: string) {
  const normalized = region.trim().toUpperCase();
  if (normalized === "EU") return "https://advertising-api-eu.amazon.com";
  if (normalized === "FE" || normalized === "APAC") return "https://advertising-api-fe.amazon.com";
  return "https://advertising-api.amazon.com";
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function retryDelay(response: Response, attempt: number) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(60_000, Math.max(1_000, seconds * 1000));
  }
  return Math.min(45_000, 1_500 * 2 ** attempt) + Math.floor(Math.random() * 750);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export function summarizeSponsoredProductsRows(rows: unknown[]): AdsReportSummary {
  const aggregates: Metrics = {};
  const groups = new Map<string, Group>();
  const add = (target: Metrics, key: string, value: unknown) => {
    target[key] = (target[key] ?? 0) + numberValue(value);
  };
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    add(aggregates, "impressions", row.impressions);
    add(aggregates, "clicks", row.clicks);
    add(aggregates, "totalCost", row.cost);
    add(aggregates, "purchases", row.purchases14d);
    add(aggregates, "sales", row.sales14d);
    const campaignId = String(row.campaignId ?? "") || undefined;
    const campaignName = String(row.campaignName ?? "") || undefined;
    const key = campaignId || campaignName;
    if (!key) continue;
    const group = groups.get(key) ?? { campaignId, campaignName, aggregates: {} };
    add(group.aggregates, "impressions", row.impressions);
    add(group.aggregates, "clicks", row.clicks);
    add(group.aggregates, "totalCost", row.cost);
    add(group.aggregates, "purchases", row.purchases14d);
    add(group.aggregates, "sales", row.sales14d);
    groups.set(key, group);
  }
  return { aggregates, groups: [...groups.values()], rowCount: rows.length };
}

export class AmazonAdsApiClient {
  private accessToken: string | null = null;
  private expiresAt = 0;

  constructor(private readonly credentials: AmazonCredentials) {}

  private async token(force = false) {
    if (!force && this.accessToken && Date.now() < this.expiresAt - 5 * 60_000) return this.accessToken;
    const form = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.credentials.refreshToken,
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
    });
    const response = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: form,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Amazon 授权刷新失败 (${response.status}): ${text.slice(0, 240)}`);
    const data = JSON.parse(text) as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new Error("Amazon 授权响应没有 access_token");
    this.accessToken = data.access_token;
    this.expiresAt = Date.now() + Math.max(60, Number(data.expires_in ?? 3600)) * 1000;
    return data.access_token;
  }

  private async request(path: string, init: RequestInit = {}, retry401 = true): Promise<Response> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const token = await this.token();
      const response = await fetch(`${apiBase(this.credentials.region)}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Amazon-Advertising-API-ClientId": this.credentials.clientId,
          "Amazon-Advertising-API-Scope": this.credentials.profileId,
          ...(init.headers ?? {}),
        },
      });
      if (response.status === 401 && retry401) {
        this.accessToken = null;
        this.expiresAt = 0;
        await this.token(true);
        return this.request(path, init, false);
      }
      if ((response.status === 408 || response.status === 429 || response.status >= 500) && attempt < 5) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      return response;
    }
    throw new Error("Amazon Ads API 重试次数已用尽");
  }

  async createSponsoredProductsCampaignReport(startDate: string, endDate: string, name: string) {
    const body = {
      name,
      startDate,
      endDate,
      configuration: {
        adProduct: "SPONSORED_PRODUCTS",
        groupBy: ["campaign", "adGroup"],
        columns: REPORT_COLUMNS,
        reportTypeId: "spCampaigns",
        timeUnit: "DAILY",
        format: "GZIP_JSON",
      },
    };
    const response = await this.request("/reporting/reports", {
      method: "POST",
      headers: {
        "content-type": "application/vnd.createasyncreportrequest.v3+json",
        accept: "application/vnd.createasyncreportresponse.v3+json",
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Amazon Ads API 创建报表失败 (${response.status}): ${text.slice(0, 500)}`);
    const data = JSON.parse(text) as ReportStatus;
    if (!data.reportId) throw new Error("Amazon Ads API 创建报表后没有返回 reportId");
    return { data, request: body };
  }

  async getReport(reportId: string) {
    const response = await this.request(`/reporting/reports/${encodeURIComponent(reportId)}`, {
      headers: { accept: "application/vnd.getasyncreportresponse.v3+json" },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Amazon Ads API 查询报表失败 (${response.status}): ${text.slice(0, 500)}`);
    return JSON.parse(text) as ReportStatus;
  }

  async waitForReport(reportId: string, timeoutMs: number, onStatus?: (text: string) => void) {
    const deadline = Date.now() + timeoutMs;
    let checks = 0;
    while (Date.now() < deadline) {
      const report = await this.getReport(reportId);
      const status = String(report.status ?? "PENDING").toUpperCase();
      checks++;
      onStatus?.(`Amazon Ads API 报表状态：${status}（第 ${checks} 次轮询）`);
      if (status === "COMPLETED") {
        if (!report.url) throw new Error("Amazon 报表已完成，但没有返回下载地址");
        return report;
      }
      if (status === "FAILED" || status === "CANCELLED") {
        throw new Error(`Amazon 报表状态为 ${status}${report.failureReason ? `：${report.failureReason}` : ""}`);
      }
      await sleep(Math.min(15_000, Math.max(1_000, deadline - Date.now())));
    }
    throw new Error(`等待 Amazon 报表超时（${Math.round(timeoutMs / 60_000)} 分钟），可稍后继续轮询同一 reportId`);
  }

  async downloadRows(url: string) {
    let response: Response | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      response = await fetch(url);
      if (response.ok) break;
      if ((response.status === 408 || response.status === 429 || response.status >= 500) && attempt < 4) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      const detail = await response.text();
      throw new Error(`Amazon 报表下载失败 (${response.status}): ${detail.slice(0, 300)}`);
    }
    if (!response?.ok) throw new Error("Amazon 报表下载失败");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 50 * 1024 * 1024) throw new Error("Amazon 报表超过 50MB 安全上限");
    let text: string;
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      const stream = new Response(bytes).body;
      if (!stream) throw new Error("Amazon GZIP 报表无法读取");
      text = await new Response(stream.pipeThrough(new DecompressionStream("gzip"))).text();
    } else {
      text = new TextDecoder().decode(bytes);
    }
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Amazon 报表内容不是预期的 JSON 数组");
    return { rows: parsed, json: text };
  }
}

type JobRow = { id: string; reportId?: string | null; status: string };

export async function executeDirectCampaignReport(
  client: AmazonAdsApiClient,
  startDate: string,
  endDate: string,
  context: { userId: string; accountId: string; timeoutMs: number; onStatus?: (text: string) => void },
) {
  const requestFingerprint = await sha256(JSON.stringify({
    api: "amazon-ads-reporting-v3",
    profile: context.accountId,
    startDate,
    endDate,
    reportTypeId: "spCampaigns",
    columns: REPORT_COLUMNS,
  }));
  let job = await d1().prepare(
    `SELECT id,report_id reportId,status FROM report_jobs WHERE user_id=? AND account_id=? AND request_fingerprint=?`,
  ).bind(context.userId, context.accountId, requestFingerprint).first<JobRow>();
  if (job?.status === "COMPLETED") {
    const saved = await d1().prepare(
      `SELECT summary_json summaryJson,object_key objectKey FROM report_files WHERE report_job_id=? ORDER BY part_number LIMIT 1`,
    ).bind(job.id).first<{ summaryJson: string; objectKey: string }>();
    const object = saved?.objectKey ? await appEnv().FILES?.get(saved.objectKey) : null;
    if (saved?.summaryJson && object) {
      const rows = JSON.parse(await object.text()) as unknown;
      if (Array.isArray(rows)) return { reportId: job.reportId, summary: JSON.parse(saved.summaryJson) as AdsReportSummary, rows, jobId: job.id, reused: true };
    }
  }
  let reportId = job?.reportId ?? "";
  if (!job) {
    const id = crypto.randomUUID();
    const now = Date.now();
    await d1().prepare(
      `INSERT INTO report_jobs(id,user_id,account_id,report_id,create_tool,request_fingerprint,request_args,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    ).bind(id, context.userId, context.accountId, null, "ads-api-v3:spCampaigns", requestFingerprint, JSON.stringify({ startDate, endDate, reportTypeId: "spCampaigns" }), "CREATING", now, now).run();
    job = { id, status: "CREATING" };
  }
  if (!reportId || ["FAILED", "CANCELLED", "CREATE_FAILED", "DOWNLOAD_FAILED"].includes(job.status)) {
    context.onStatus?.("正在通过 Amazon Ads Reporting API v3 创建 SP Campaign 报表");
    try {
      const created = await client.createSponsoredProductsCampaignReport(startDate, endDate, `AmzPilot SP Campaign ${startDate} to ${endDate}`);
      reportId = created.data.reportId;
      await d1().prepare(`UPDATE report_jobs SET report_id=?,request_args=?,status='PENDING',error=NULL,updated_at=? WHERE id=?`)
        .bind(reportId, JSON.stringify(created.request), Date.now(), job.id).run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await d1().prepare(`UPDATE report_jobs SET status='CREATE_FAILED',error=?,updated_at=? WHERE id=?`)
        .bind(message.slice(0, 1000), Date.now(), job.id).run();
      throw error;
    }
  } else {
    context.onStatus?.(`继续轮询已创建的 Amazon 报表 ${reportId}`);
  }

  try {
    const completed = await client.waitForReport(reportId, context.timeoutMs, context.onStatus);
    await d1().prepare(`UPDATE report_jobs SET status='DOWNLOADING',error=NULL,updated_at=? WHERE id=?`).bind(Date.now(), job.id).run();
    const downloaded = await client.downloadRows(String(completed.url));
    const summary = summarizeSponsoredProductsRows(downloaded.rows);
    const bucket = appEnv().FILES;
    if (!bucket) throw new Error("报表文件存储尚未配置");
    const objectKey = `reports/${context.userId}/${context.accountId}/${job.id}/amazon-ads-v3.json`;
    const bytes = new TextEncoder().encode(downloaded.json);
    await bucket.put(objectKey, bytes, { httpMetadata: { contentType: "application/json; charset=utf-8" } });
    await d1().prepare(
      `INSERT INTO report_files(id,report_job_id,part_number,object_key,filename,content_type,size,row_count,summary_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(report_job_id,part_number) DO UPDATE SET object_key=excluded.object_key,filename=excluded.filename,content_type=excluded.content_type,size=excluded.size,row_count=excluded.row_count,summary_json=excluded.summary_json`,
    ).bind(crypto.randomUUID(), job.id, 1, objectKey, `amazon-ads-sp-campaign-${startDate}-${endDate}.json`, "application/json; charset=utf-8", bytes.byteLength, summary.rowCount, JSON.stringify(summary), Date.now()).run();
    await d1().prepare(`UPDATE report_jobs SET status='COMPLETED',error=NULL,completed_at=?,updated_at=? WHERE id=?`).bind(Date.now(), Date.now(), job.id).run();
    return { reportId, summary, rows: downloaded.rows, jobId: job.id, reused: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timeout = /超时/.test(message);
    await d1().prepare(`UPDATE report_jobs SET status=?,error=?,updated_at=? WHERE id=?`)
      .bind(timeout ? "TIMEOUT" : "FAILED", message.slice(0, 1000), Date.now(), job.id).run();
    throw error;
  }
}
