import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { accountCredentials } from "../lib/accounts";
import { accountContextBlock } from "../lib/account-context";
import { AmazonMcpClient, amazonAdsAccessToken, isWriteTool, type McpTool } from "../lib/amazon-mcp";
import { cloudflareAdsAgentConfigured, pollCloudflareAdsAgentJob, startCloudflareAdsAgentJob, warmCloudflareAdsAgent, type LangGraphAdsInput, type LangGraphAdsResult } from "../lib/cloudflare-ads-agent";
import { modelConfigForUser } from "../lib/model-config";
import { d1 } from "../lib/db";
import { decideEnhancedAds, type EnhancedMessage, type EnhancedToolCall } from "../lib/enhanced-ads-model";
import { executeReportTool } from "../lib/report-jobs";
import { normalizeAmazonToolArguments } from "../lib/tool-schema";

type Params = { runId: string; userId: string; accountId: string; conversationId: string; prompt: string };
type ApprovalPayload = { approved: boolean };
type ToolResult = { output: unknown; toolName: string; args: Record<string, unknown> };

const MAX_ROUNDS = 80;
const MAX_LOG_CHARS = 60_000;

function clip(value: unknown, maximum = MAX_LOG_CHARS): string {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return text.length > maximum ? `${text.slice(0, maximum)}\n[truncated]` : text;
}

function safeJson(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function mergeCampaignGroups(value: unknown) {
  const files = value && typeof value === "object" ? (value as { downloadedReports?: unknown }).downloadedReports : undefined;
  const merged = new Map<string, { campaignId?: string; campaignName?: string; cost: number; sales: number; purchases: number; clicks: number; impressions: number }>();
  if (!Array.isArray(files)) return [];
  for (const file of files) {
    const groups = file && typeof file === "object" ? (file as { groups?: unknown }).groups : undefined;
    if (!Array.isArray(groups)) continue;
    for (const item of groups) {
      if (!item || typeof item !== "object") continue;
      const group = item as { campaignId?: string; campaignName?: string; aggregates?: Record<string, number> };
      const key = group.campaignId || group.campaignName;
      if (!key) continue;
      const current = merged.get(key) ?? { campaignId: group.campaignId, campaignName: group.campaignName, cost: 0, sales: 0, purchases: 0, clicks: 0, impressions: 0 };
      current.cost += Number(group.aggregates?.totalCost ?? 0);
      current.sales += Number(group.aggregates?.sales ?? 0);
      current.purchases += Number(group.aggregates?.purchases ?? 0);
      current.clicks += Number(group.aggregates?.clicks ?? 0);
      current.impressions += Number(group.aggregates?.impressions ?? 0);
      merged.set(key, current);
    }
  }
  return [...merged.values()].map((item) => ({ ...item, acos: item.sales > 0 ? item.cost / item.sales * 100 : null, roas: item.cost > 0 ? item.sales / item.cost : null }));
}

function withDeterministicAnalysis(output: unknown): unknown {
  if (!output || typeof output !== "object") return output;
  const campaigns = mergeCampaignGroups(output);
  if (!campaigns.length) return output;
  const spendWithoutSales = campaigns.filter((item) => item.cost > 0 && item.sales <= 0).sort((a, b) => b.cost - a.cost).slice(0, 10);
  const finiteAcos = campaigns.filter((item) => typeof item.acos === "number" && Number.isFinite(item.acos)).sort((a, b) => Number(b.acos) - Number(a.acos)).slice(0, 10);
  return {
    ...(output as Record<string, unknown>),
    deterministicAnalysis: {
      campaignCount: campaigns.length,
      operationalWorst: spendWithoutSales[0] ?? finiteAcos[0] ?? null,
      highestFiniteAcos: finiteAcos[0] ?? null,
      spendWithoutSales,
      highestAcosCampaigns: finiteAcos,
      rule: "运营风险优先：有花费但零销售；有限 ACOS 排名仅包含 sales > 0 的活动。",
    },
  };
}

async function eventLog(params: Params, eventType: string, options: { round?: number; toolName?: string; input?: unknown; output?: unknown; status?: string } = {}) {
  const now = Date.now();
  await d1().batch([
    d1().prepare(`INSERT INTO enhanced_ads_events(id,run_id,user_id,account_id,event_type,round,tool_name,input_json,output_json,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), params.runId, params.userId, params.accountId, eventType, options.round ?? null, options.toolName ?? null, options.input === undefined ? null : clip(options.input), options.output === undefined ? null : clip(options.output), options.status ?? "info", now),
    d1().prepare(`INSERT INTO agent_logs(id,user_id,account_id,agent,run_id,event_type,round,tool_name,input_json,output_json,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), params.userId, params.accountId, "enhanced-ads", params.runId, eventType, options.round ?? null, options.toolName ?? null, options.input === undefined ? null : clip(options.input), options.output === undefined ? null : clip(options.output), options.status ?? "info", now),
  ]);
}

async function updateRun(runId: string, values: { status?: string; stage?: string; round?: number; toolCount?: number; answer?: string | null; error?: string | null; approval?: unknown | null; completed?: boolean }) {
  await d1().prepare(`UPDATE enhanced_ads_runs SET status=COALESCE(?,status),stage=COALESCE(?,stage),round=COALESCE(?,round),tool_count=COALESCE(?,tool_count),answer=?,error=?,approval_json=?,updated_at=?,completed_at=? WHERE id=?`)
    .bind(values.status ?? null, values.stage ?? null, values.round ?? null, values.toolCount ?? null, values.answer === undefined ? null : values.answer, values.error === undefined ? null : values.error, values.approval == null ? null : JSON.stringify(values.approval), Date.now(), values.completed ? Date.now() : null, runId).run();
}

async function logLangGraphTrace(params: Params, result: LangGraphAdsResult, invocation: number) {
  for (const item of result.trace) {
    await eventLog(params, item.event, {
      round: invocation,
      toolName: item.tool,
      input: item.arguments,
      output: item.output,
      status: item.event === "tool.result" ? "success" : "running",
    });
  }
}

async function runOnLangGraphContainer(params: Params, step: WorkflowStep) {
  const initialized = await step.do("prepare LangGraph Container request", async () => {
    const account = await d1().prepare(`SELECT id,name,region,marketplace,timezone,currency,profile_id,advertiser_account_id FROM accounts WHERE id=? AND user_id=?`).bind(params.accountId, params.userId).first<Record<string, unknown>>();
    if (!account) throw new Error("广告账户不存在或不属于当前用户");
    const model = await modelConfigForUser(params.userId);
    await updateRun(params.runId, { status: "running", stage: "langgraph_starting", round: 1, toolCount: 0 });
    await eventLog(params, "langgraph.started", { round: 1, output: { runtime: "Cloudflare Container", server: "FastAPI", framework: "LangGraph", model: model.modelName }, status: "running" });
    return { account };
  });

  await step.do("warm LangGraph Container", async () => {
    await warmCloudflareAdsAgent();
    await updateRun(params.runId, { status: "running", stage: "langgraph_reasoning", round: 1, toolCount: 0 });
    return { ready: true, port: 9000 };
  });

  const invocationInput = async (allowWrite: boolean, approvedToolName?: string): Promise<LangGraphAdsInput> => {
    // Resolve long-lived credentials inside the step invocation. Workflow output
    // persistence must never contain refresh tokens, client secrets or model keys.
    const { credentials } = await accountCredentials(params.userId, params.accountId);
    const model = await modelConfigForUser(params.userId);
    return {
      prompt: params.prompt,
      accessToken: await amazonAdsAccessToken(credentials),
      clientId: credentials.clientId,
      modelBaseUrl: model.baseUrl,
      modelApiKey: model.apiKey,
      modelName: model.modelName,
      modelUserAgent: model.userAgent,
      region: credentials.region,
      profileId: credentials.profileId,
      advertiserAccountId: credentials.advertiserAccountId || String(initialized.account.advertiser_account_id || "") || undefined,
      marketplace: String(initialized.account.marketplace || "") || undefined,
      accountName: String(initialized.account.name || "") || undefined,
      timezone: String(initialized.account.timezone || "") || undefined,
      currency: String(initialized.account.currency || "") || undefined,
      conversationId: params.conversationId,
      runId: params.runId,
      allowWrite,
      approvedToolName,
    };
  };

  const runJob = async (phase: "read" | "approved", allowWrite: boolean, approvedToolName?: string) => {
    const jobId = `${params.runId}-${phase}`;
    await step.do(`start LangGraph ${phase} job`, async () => {
      const state = await startCloudflareAdsAgentJob(jobId, await invocationInput(allowWrite, approvedToolName));
      return { jobId, status: state.status };
    });
    for (let poll = 1; poll <= 60; poll++) {
      await step.sleep(`wait for LangGraph ${phase} job ${poll}`, "20 seconds");
      const state = await step.do(`poll LangGraph ${phase} job ${poll}`, () => pollCloudflareAdsAgentJob(jobId));
      if (state.status === "completed" && state.result) return state.result;
      if (state.status === "failed") throw new Error(`LangGraph job 执行失败：${state.error || "未知错误"}`);
      if (state.status === "not_found") throw new Error("LangGraph job 状态丢失；容器可能已被重启");
    }
    throw new Error("LangGraph job 超过 20 分钟仍未完成");
  };

  let invocation = 1;
  let result = await runJob("read", false);
  await logLangGraphTrace(params, result, 1);
  await updateRun(params.runId, { status: "running", stage: "langgraph_reasoning", round: 1, toolCount: result.tool_count });

  if (result.approval?.approval_required && result.approval.tool_name) {
    const approval = {
      toolName: result.approval.tool_name,
      args: result.approval.arguments ?? {},
      summary: result.approval.message || `LangGraph Agent 计划执行 Amazon Ads 写操作：${result.approval.tool_name}`,
    };
    await step.do("request LangGraph write approval", async () => {
      await updateRun(params.runId, { status: "waiting_approval", stage: "waiting_approval", round: 1, toolCount: result.tool_count, approval });
      await eventLog(params, "approval.requested", { round: 1, toolName: approval.toolName, input: approval.args, status: "pending" });
    });
    const approvalEvent = await step.waitForEvent<ApprovalPayload>("wait for LangGraph approval", { type: "approval", timeout: "7 days" });
    if (!approvalEvent.payload.approved) {
      result = { ...result, response: "操作已取消，未对 Amazon Ads 账户进行任何修改。", approval: null };
      await eventLog(params, "approval.rejected", { round: 1, toolName: approval.toolName, status: "cancelled" });
    } else {
      await eventLog(params, "approval.approved", { round: 2, toolName: approval.toolName, status: "success" });
      await updateRun(params.runId, { status: "running", stage: "langgraph_executing_write", round: 2, toolCount: result.tool_count, approval: null });
      invocation = 2;
      result = await runJob("approved", true, approval.toolName);
      await logLangGraphTrace(params, result, 2);
    }
  }

  await step.do("save LangGraph answer", async () => {
    await d1().batch([
      d1().prepare(`UPDATE enhanced_ads_runs SET status='completed',stage='completed',answer=?,error=NULL,approval_json=NULL,round=?,tool_count=?,updated_at=?,completed_at=? WHERE id=?`).bind(result.response, invocation, result.tool_count, Date.now(), Date.now(), params.runId),
      d1().prepare(`INSERT INTO enhanced_ads_messages(id,conversation_id,user_id,account_id,run_id,role,content,created_at) VALUES(?,?,?,?,?,'assistant',?,?)`).bind(crypto.randomUUID(), params.conversationId, params.userId, params.accountId, params.runId, result.response, Date.now()),
    ]);
    await eventLog(params, "run.finish", { output: { answer: result.response, runtime: "cloudflare-langgraph", toolCount: result.tool_count }, status: "success" });
  });
  return { runId: params.runId, answer: result.response, runtime: "cloudflare-langgraph", toolCount: result.tool_count };
}

async function executeTool(params: Params, tool: McpTool, call: EnhancedToolCall, round: number): Promise<ToolResult> {
  const parsed = safeJson(call.function.arguments);
  const args = normalizeAmazonToolArguments(tool.name, parsed, tool.inputSchema);
  await eventLog(params, "tool.call", { round, toolName: tool.name, input: args, status: "running" });
  const { credentials } = await accountCredentials(params.userId, params.accountId);
  const client = new AmazonMcpClient(credentials);
  const output = tool.name.startsWith("reporting-")
    ? await executeReportTool(client, tool.name, args, { userId: params.userId, accountId: params.accountId, queryText: params.prompt, timeoutMs: 8 * 60_000 })
    : await client.callTool(tool.name, args);
  const enriched = tool.name.startsWith("reporting-") ? withDeterministicAnalysis(output) : output;
  await eventLog(params, "tool.result", { round, toolName: tool.name, output: enriched, status: "success" });
  return { output: enriched, toolName: tool.name, args };
}

export class EnhancedAdsWorkflow extends WorkflowEntrypoint<Record<string, unknown>, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const params = event.payload;
    try {
      if (cloudflareAdsAgentConfigured()) return await runOnLangGraphContainer(params, step);
      const initialized = await step.do("initialize agent and discover MCP tools", async () => {
        const account = await d1().prepare(`SELECT id,name,region,marketplace,timezone,currency,profile_id,advertiser_account_id FROM accounts WHERE id=? AND user_id=?`).bind(params.accountId, params.userId).first<Record<string, unknown>>();
        if (!account) throw new Error("广告账户不存在或不属于当前用户");
        const { credentials } = await accountCredentials(params.userId, params.accountId);
        const tools = await new AmazonMcpClient(credentials).listTools();
        if (!tools.length) throw new Error("Amazon Ads MCP tools/list 没有返回工具");
        const history = await d1().prepare(`SELECT role,content FROM enhanced_ads_messages WHERE user_id=? AND conversation_id=? AND run_id<>? ORDER BY created_at DESC LIMIT 12`).bind(params.userId, params.conversationId, params.runId).all<{ role: string; content: string }>();
        const messages: EnhancedMessage[] = (history.results ?? []).reverse().map((item) => ({ role: item.role === "assistant" ? "assistant" : "user", content: item.content }));
        messages.push({ role: "user", content: params.prompt });
        await updateRun(params.runId, { status: "running", stage: "tools_ready", round: 0, toolCount: tools.length });
        await eventLog(params, "tools.discovered", { output: { count: tools.length, names: tools.map((tool) => tool.name) }, status: "success" });
        return { accountContext: accountContextBlock(account), tools, messages };
      });

      const tools = initialized.tools as McpTool[];
      const messages = initialized.messages as EnhancedMessage[];
      let executedTools = 0;
      for (let round = 1; round <= MAX_ROUNDS; round++) {
        await updateRun(params.runId, { status: "running", stage: "reasoning", round, toolCount: tools.length });
        const reply = await step.do(`model reasoning round ${round}`, async () => {
          const result = await decideEnhancedAds({ userId: params.userId, messages, tools, accountContext: initialized.accountContext, round });
          await eventLog(params, "model.reply", { round, input: { messageCount: messages.length, toolCount: tools.length }, output: result, status: "success" });
          return result;
        });
        messages.push({ role: "assistant", content: reply.content, tool_calls: reply.toolCalls });

        if (!reply.toolCalls.length) {
          const answer = reply.content.trim();
          if (!answer) throw new Error("模型结束了工具循环，但没有生成答案");
          await step.do("save final answer", async () => {
            await d1().batch([
              d1().prepare(`UPDATE enhanced_ads_runs SET status='completed',stage='completed',answer=?,error=NULL,approval_json=NULL,round=?,updated_at=?,completed_at=? WHERE id=?`).bind(answer, round, Date.now(), Date.now(), params.runId),
              d1().prepare(`INSERT INTO enhanced_ads_messages(id,conversation_id,user_id,account_id,run_id,role,content,created_at) VALUES(?,?,?,?,?,'assistant',?,?)`).bind(crypto.randomUUID(), params.conversationId, params.userId, params.accountId, params.runId, answer, Date.now()),
            ]);
            await eventLog(params, "run.finish", { round, output: { answer, executedTools }, status: "success" });
          });
          return { runId: params.runId, answer, rounds: round, executedTools };
        }

        for (let index = 0; index < reply.toolCalls.length; index++) {
          const call = reply.toolCalls[index];
          const tool = tools.find((item) => item.name === call.function.name);
          if (!tool) {
            messages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: JSON.stringify({ isError: true, error: `工具不存在：${call.function.name}`, availableTools: tools.map((item) => item.name) }) });
            await eventLog(params, "tool.not_found", { round, toolName: call.function.name, status: "failure" });
            continue;
          }

          if (isWriteTool(tool.name)) {
            const approval = { toolName: tool.name, args: normalizeAmazonToolArguments(tool.name, safeJson(call.function.arguments), tool.inputSchema), summary: `模型计划执行 Amazon Ads 写操作：${tool.name}` };
            await step.do(`request approval round ${round} tool ${index + 1}`, async () => {
              await updateRun(params.runId, { status: "waiting_approval", stage: "waiting_approval", round, toolCount: tools.length, approval });
              await eventLog(params, "approval.requested", { round, toolName: tool.name, input: approval.args, status: "pending" });
            });
            const approvalEvent = await step.waitForEvent<ApprovalPayload>(`wait for approval round ${round} tool ${index + 1}`, { type: "approval", timeout: "7 days" });
            await updateRun(params.runId, { status: "running", stage: "executing_tool", round, toolCount: tools.length, approval: null });
            if (!approvalEvent.payload.approved) {
              messages.push({ role: "tool", tool_call_id: call.id, name: tool.name, content: JSON.stringify({ cancelled: true, message: "用户拒绝了本次写操作" }) });
              await eventLog(params, "approval.rejected", { round, toolName: tool.name, status: "cancelled" });
              continue;
            }
            await eventLog(params, "approval.approved", { round, toolName: tool.name, status: "success" });
          }

          await updateRun(params.runId, { status: "running", stage: tool.name.startsWith("reporting-") ? "processing_report" : "executing_tool", round, toolCount: tools.length });
          try {
            const result = await step.do(`tool round ${round} item ${index + 1} ${tool.name}`.slice(0, 250), async () => executeTool(params, tool, call, round));
            executedTools++;
            messages.push({ role: "tool", tool_call_id: call.id, name: tool.name, content: clip(result.output, 850_000) });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await eventLog(params, "tool.error", { round, toolName: tool.name, input: safeJson(call.function.arguments), output: { error: message }, status: "failure" });
            messages.push({ role: "tool", tool_call_id: call.id, name: tool.name, content: JSON.stringify({ isError: true, error: message, instruction: "根据本轮实时 inputSchema 修正参数后继续，不要直接结束任务。" }) });
          }
        }
      }
      throw new Error(`增强型智能广告 Agent 超过 ${MAX_ROUNDS} 轮仍未完成`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await step.do("record workflow failure", async () => {
        await d1().prepare(`UPDATE enhanced_ads_runs SET status='failed',stage='failed',error=?,approval_json=NULL,updated_at=?,completed_at=? WHERE id=?`).bind(message.slice(0, 2000), Date.now(), Date.now(), params.runId).run();
        await eventLog(params, "run.finish", { output: { error: message }, status: "failure" });
      });
      throw error;
    }
  }
}
