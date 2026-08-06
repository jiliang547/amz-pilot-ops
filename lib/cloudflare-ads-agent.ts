import { appEnv } from "./db";

export type LangGraphAdsInput = {
  prompt: string;
  accessToken: string;
  clientId: string;
  modelBaseUrl: string;
  modelApiKey: string;
  modelName: string;
  modelUserAgent: string;
  region: string;
  profileId?: string;
  advertiserAccountId?: string;
  marketplace?: string;
  accountName?: string;
  timezone?: string;
  currency?: string;
  conversationId: string;
  runId: string;
  allowWrite?: boolean;
  approvedToolName?: string;
};

export type LangGraphTraceEvent = {
  event: "tool.call" | "tool.result";
  tool?: string;
  arguments?: unknown;
  output?: string;
};

export type LangGraphAdsResult = {
  response: string;
  trace: LangGraphTraceEvent[];
  tool_count: number;
  approval?: { approval_required?: boolean; tool_name?: string; arguments?: unknown; message?: string } | null;
};

export type LangGraphJobState = {
  job_id: string;
  status: "queued" | "running" | "completed" | "failed" | "not_found";
  result?: LangGraphAdsResult;
  error?: string;
};

export function cloudflareAdsAgentConfigured(): boolean {
  return Boolean(appEnv().ENHANCED_ADS_CONTAINER);
}

function langGraphContainer() {
  const binding = appEnv().ENHANCED_ADS_CONTAINER;
  if (!binding) throw new Error("增强型智能广告 LangGraph Container 尚未绑定");
  return binding.getByName("enhanced-ads-langgraph-v1");
}

export async function warmCloudflareAdsAgent(): Promise<void> {
  await langGraphContainer().startAndWaitForPorts({
    ports: [9000],
    cancellationOptions: { instanceGetTimeoutMS: 20_000, portReadyTimeoutMS: 60_000 },
  });
}

export async function invokeCloudflareAdsAgent(input: LangGraphAdsInput): Promise<LangGraphAdsResult> {
  const container = langGraphContainer();
  const response = await container.fetch("http://enhanced-ads-container/invocations", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      prompt: input.prompt,
      access_token: input.accessToken,
      client_id: input.clientId,
      model_base_url: input.modelBaseUrl,
      model_api_key: input.modelApiKey,
      model_name: input.modelName,
      model_user_agent: input.modelUserAgent,
      region: input.region,
      profile_id: input.profileId,
      advertiser_account_id: input.advertiserAccountId,
      marketplace: input.marketplace,
      account_name: input.accountName,
      timezone: input.timezone,
      currency: input.currency,
      conversation_id: input.conversationId,
      run_id: input.runId,
      allow_write: input.allowWrite === true,
      approved_tool_name: input.approvedToolName,
    }),
    signal: AbortSignal.timeout(14 * 60_000),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`LangGraph Container 请求失败 (${response.status}): ${raw.slice(0, 500)}`);
  const result = JSON.parse(raw) as LangGraphAdsResult;
  if (typeof result.response !== "string") throw new Error("LangGraph Container 没有返回有效答案");
  return { ...result, trace: Array.isArray(result.trace) ? result.trace : [], tool_count: Number(result.tool_count || 0) };
}

export async function startCloudflareAdsAgentJob(jobId: string, input: LangGraphAdsInput): Promise<LangGraphJobState> {
  const response = await langGraphContainer().fetch(`http://enhanced-ads-container/jobs/${encodeURIComponent(jobId)}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      prompt: input.prompt,
      access_token: input.accessToken,
      client_id: input.clientId,
      model_base_url: input.modelBaseUrl,
      model_api_key: input.modelApiKey,
      model_name: input.modelName,
      model_user_agent: input.modelUserAgent,
      region: input.region,
      profile_id: input.profileId,
      advertiser_account_id: input.advertiserAccountId,
      marketplace: input.marketplace,
      account_name: input.accountName,
      timezone: input.timezone,
      currency: input.currency,
      conversation_id: input.conversationId,
      run_id: input.runId,
      allow_write: input.allowWrite === true,
      approved_tool_name: input.approvedToolName,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const raw = await response.text();
  if (!response.ok && response.status !== 202) throw new Error(`LangGraph job 启动失败 (${response.status}): ${raw.slice(0, 500)}`);
  return JSON.parse(raw) as LangGraphJobState;
}

export async function pollCloudflareAdsAgentJob(jobId: string): Promise<LangGraphJobState> {
  const response = await langGraphContainer().fetch(`http://enhanced-ads-container/jobs/${encodeURIComponent(jobId)}`, {
    method: "GET",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  if (!response.ok && response.status !== 404) throw new Error(`LangGraph job 查询失败 (${response.status}): ${raw.slice(0, 500)}`);
  return JSON.parse(raw) as LangGraphJobState;
}
