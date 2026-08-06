import { d1 } from "./db";
import { accountCredentials } from "./accounts";
import { accountContextBlock, discoverAccountMetadata } from "./account-context";
import { AmazonMcpClient, isWriteTool, modeForTool } from "./amazon-mcp";
import { decide, type AgentMessage, type ModelContent, type ToolCall } from "./model";
import { executeReportTool, prepareReportToolArgs } from "./report-jobs";
import type { ActiveSkill } from "./custom-skills";
import { finishAgentLog, startAgentLog, writeAgentLog } from "./agent-logs";
import {
  ADS_CAPABILITIES,
  ADS_CAPABILITY_TOOL_NAME,
  adsCapabilityTool,
  capabilityCatalog,
  capabilityForToolName,
  initialAdsTools,
  mergeTools,
  toolsForCapabilities,
  type AdsCapability,
} from "./ads-tool-catalog";
import {
  ADS_V2_PLAN_TOOL,
  ADS_V2_VERDICT_TOOL,
  adsV2PlanTool,
  adsV2VerdictTool,
  hasUsableEvidence,
  mcpResultError,
  parseAdsAnswerVerdict,
  parseAdsTaskPlan,
  type AdsTaskPlan,
} from "./ads-agent-v2";
import { adsV2Checkpoint } from "./ads-agent-checkpoint";
import { normalizeAmazonToolArguments } from "./tool-schema";

// Custom Skills may explicitly request the MCP protocol's tools/list method.
// Expose it as a local read-only adapter so the model can inspect the already
// validated allowlisted schema without attempting an unauthorized remote call.
const schemaTool = {
  name: "tools/list",
  description: "Return the complete Amazon Ads MCP tool-name catalog grouped by business capability. Schemas are loaded on demand with amazon_ads-load_capabilities.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
} satisfies import("./amazon-mcp").McpTool;
function tryLocalConversation(message?: string) {
  if (!message) return undefined;
  const normalized = message.trim().replace(/[!！?？。.，,\s]+$/g, "").toLowerCase();
  if (!normalized) return undefined;
  if (/^(你好|您好|嗨|hi|hello|hey|在吗|有人吗)$/.test(normalized)) {
    return "你好，我是 AMZ Pilot。你可以直接告诉我需要查询或调整的 Amazon Ads 内容，例如“查询今天的广告花费总额”。";
  }
  if (/^(谢谢|感谢|多谢|thanks|thank you|好的|好|ok|okay|收到|明白了)$/.test(normalized)) {
    return "不客气。需要继续查询、分析或调整 Amazon Ads 时，直接告诉我即可。";
  }
  if (/^(你是谁|你能做什么|有什么功能|怎么用|帮助|help)$/.test(normalized)) {
    return "我是 AMZ Pilot，可以查询 Amazon Ads 账户、广告活动、广告组、广告、关键词与报表，也可以在你确认后执行调整。标准花费、销售额、点击量等汇总查询会直接由后端完成，不消耗模型 Token。";
  }
  return undefined;
}

function asksForKnownAccount(content: string): boolean {
  const text = content.replace(/\s+/g, " ").trim();
  if (!text) return false;

  // This is a last-resort guard, not a keyword detector.  Do not replace a
  // useful Skill/MCP response merely because it mentions an account, profile,
  // or marketplace while explaining what was found or what is unavailable.
  if (/(无需|不需要|已选择|已使用|已确认|当前已|初始化.*完成|账户.*确认|报告.*工具|MCP.*工具|Skill|阶段[A-E]|下一步)/i.test(text)) {
    return false;
  }

  const account = /(account\s*id|accountid|marketplace|profile\s*id|账户|账号|店铺|站点)/i;
  const directAsk = /(?:请(?:先)?(?:提供|补充|填写|输入|选择|确认|告诉)|需要(?:您|你)?(?:提供|补充|填写|输入|选择|确认)|必须(?:提供|填写|选择|确认)|缺少|未(?:提供|填写|选择)|没有提供|please\s+(?:provide|specify|select|confirm)|(?:missing|required)\s+(?:your\s+)?(?:account|profile|marketplace)|provide\s+(?:your\s+)?(?:account|profile|marketplace))/i;
  const nearbyAsk = new RegExp(`${directAsk.source}.{0,32}${account.source}|${account.source}.{0,32}${directAsk.source}`, "i");
  return account.test(text) && nearbyAsk.test(text);
}

function selectedAccountClarification(row: Record<string, unknown>): string {
  const name = String(row.name ?? "当前店铺");
  const marketplace = String(row.marketplace ?? "").toUpperCase();
  const profileId = String(row.profile_id ?? "");
  const details = [marketplace && `${marketplace} 站点`, profileId && `Profile ${profileId}`].filter(Boolean).join("，");
  return `当前已使用你在页面选择的店铺「${name}」${details ? `（${details}）` : ""}，无需再提供 accountId 或 marketplace。请告诉我还缺少的查询对象、指标或日期范围。`;
}

function parseArgs(call: ToolCall): Record<string, unknown> {
  try { return JSON.parse(call.function.arguments || "{}"); }
  catch { throw new Error(`模型为 ${call.function.name} 生成的工具参数不是有效 JSON`); }
}

function stableKey(name: string, args: Record<string, unknown>): string {
  return `${name}:${JSON.stringify(args)}`;
}

function compactReportForModel(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const report = value as Record<string, unknown>;
  const downloadedReports = Array.isArray(report.downloadedReports)
    ? report.downloadedReports.map(item => {
        if (!item || typeof item !== "object") return item;
        const row = item as Record<string, unknown>;
        return {
          part: row.part,
          filename: row.filename,
          size: row.size,
          rowCount: row.rowCount,
          columns: row.columns,
          aggregates: row.aggregates,
          candidateSearchTerms: row.searchTermCandidates ?? [],
          candidateSearchTermCount: row.searchTermCandidateTotal ?? (Array.isArray(row.searchTermCandidates) ? row.searchTermCandidates.length : 0),
          candidateSearchTermsTruncated: row.searchTermCandidatesTruncated ?? false,
        };
      })
    : undefined;
  return {
    reportId: report.reportId,
    status: report.status,
    reusedSavedReport: report.reusedSavedReport,
    downloadedReports,
    note: "完整 CSV 已由后端保存；后端在可行时完成搜索词逐行解析、ASIN/商品归属、聚合、筛选和指标计算。模型接收候选词结果与 aggregates，不接收不必要的 CSV 正文或签名 URL；如当前 Skill 更适合本地处理，可继续使用用户上传或提供的本地处理结果。",
  };
}

function requiresWriteApprovalPolicy(requestText: string, candidate: string, plan: AdsTaskPlan): boolean {
  if (plan.requiresApproval || plan.operation === "write") return true;
  if (/(?:提交|发起|生成).{0,12}(?:审批|确认)|批准并执行|approve\s+and\s+execute/i.test(requestText)) return true;
  if (/(?:请|需要).{0,12}确认.{0,16}(?:执行|修改|创建|暂停|启用|删除)|写操作.{0,12}(?:待|等待)审批|approval\s+(?:required|pending)/i.test(candidate)) return true;
  return false;
}

function isAuthoritativeZeroReportAnswer(candidate: string, evidence: Array<{ tool: string; result: string }>): boolean {
  if (!/(?:\$|USD|花费|支出|totalCost)[^\n]{0,40}(?:0(?:\.0+)?\b)/i.test(candidate)) return false;
  return evidence.some(item => {
    if (!item.tool.startsWith("reporting-")) return false;
    try {
      const report = JSON.parse(item.result) as { status?: unknown; downloadedReports?: unknown };
      if (report.status !== "COMPLETED" || !Array.isArray(report.downloadedReports) || report.downloadedReports.length === 0) return false;
      return report.downloadedReports.some(part => {
        if (!part || typeof part !== "object") return false;
        const row = part as { rowCount?: unknown; aggregates?: unknown };
        const aggregates = row.aggregates && typeof row.aggregates === "object" ? row.aggregates as Record<string, unknown> : {};
        return Number(row.rowCount) === 0 && Number(aggregates.totalCost) === 0;
      });
    } catch {
      return false;
    }
  });
}

async function callReadTool(client: AmazonMcpClient, name: string, args: Record<string, unknown>, userId: string, accountId: string, onStatus?: (text: string) => void): Promise<unknown> {
  if (name === "reporting-create_campaign_report" || name === "reporting-create_report" || name === "reporting-retrieve_report") {
    return executeReportTool(client, name, args, { userId, accountId, onStatus, timeoutMs: 120_000 });
  }
  return client.callTool(name, args);
}

async function planAgentCore(
  userId: string,
  accountId: string | undefined,
  message: ModelContent,
  onStatus?: (text: string) => void,
  skill?: ActiveSkill,
  plainMessage?: string,
  logRunId?: string,
  checkpoint?: ReturnType<typeof adsV2Checkpoint>,
  version: "v1" | "v2" = "v2",
) {
  const useV2 = version === "v2";
  const log = (event: string, data: Record<string, unknown> = {}) => logRunId ? writeAgentLog({ userId, agent: "ads", runId: logRunId, event, accountId: accountId ?? undefined, ...data } as Parameters<typeof writeAgentLog>[0]) : Promise.resolve();
  if (!skill) {
    const localAnswer = tryLocalConversation(plainMessage);
    if (localAnswer) {
      await checkpoint?.transition("deliver", { local: true });
      onStatus?.("已由后端直接回答，未调用大模型或 Amazon MCP");
      return { type: "answer" as const, content: localAnswer, accountId: accountId ?? "local", modelRounds: 0, localPath: true };
    }
  }

  const { row, credentials } = await accountCredentials(userId, accountId);
  await checkpoint?.transition("context", { accountId: row.id, profileId: row.profile_id });
  const fixedClient = new AmazonMcpClient(credentials, "FIXED");
  const dynamicClient = new AmazonMcpClient(credentials, "DYNAMIC");
  const clients = { FIXED: fixedClient, DYNAMIC: dynamicClient };

  onStatus?.("正在核对当前 Profile 对应的站点、时区与币种");
  try {
    const accountResult = await fixedClient.callTool("ads_accounts-list_ads_accounts", {});
    const metadata = discoverAccountMetadata(accountResult, credentials.profileId);
    row.advertiser_account_id = metadata.advertiserAccountId ?? row.advertiser_account_id;
    row.marketplace = metadata.marketplace ?? row.marketplace;
    row.timezone = metadata.timezone ?? row.timezone;
    row.currency = metadata.currency ?? row.currency;
    row.name = metadata.name ?? row.name;
    credentials.advertiserAccountId = String(row.advertiser_account_id ?? credentials.advertiserAccountId ?? "") || undefined;
    await d1().prepare(`UPDATE accounts SET name=?,advertiser_account_id=?,marketplace=?,timezone=?,currency=?,updated_at=? WHERE id=? AND user_id=?`).bind(row.name, row.advertiser_account_id ?? null, row.marketplace ?? null, row.timezone ?? null, row.currency ?? null, Date.now(), row.id, userId).run();
  } catch { /* Saved account context is still usable. */ }

  const live = await fixedClient.listTools();
  const requestText = plainMessage ?? (typeof message === "string" ? message : message.map(part => part.type === "text" ? part.text : "").join(" "));
  const cdxQuestion = /cdx/i.test(requestText);
  await log("request.context", { output: { requestText: requestText.slice(0, 300), cdxQuestion } });
  await checkpoint?.transition("plan", { requestText: requestText.slice(0, 1000), skill: skill?.name ?? null });
  let taskPlan: AdsTaskPlan;
  try {
    if (!useV2) throw new Error("Ads Agent V2 planning is disabled for this staged request.");
    taskPlan = await createAdsV2Plan(userId, [{ role: "user", content: message }], skill, accountContextBlock(row));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    // Planning is an optimization and guardrail, not a new single point of failure.
    // The normal model loop can still discover more capabilities on demand.
    taskPlan = {
      operation: skill ? "skill" : "query",
      goal: requestText.slice(0, 600),
      capabilities: ["accounts", "campaigns"],
      stages: ["Understand the request", "Use live Amazon Ads MCP evidence", "Deliver a verified result"],
      successCriteria: ["Answer the user's complete request using real account data"],
      requiresFreshData: true,
      requiresApproval: false,
    };
    if (useV2) await log("graph.plan.fallback", { output: { reason, plan: taskPlan }, status: "failure" });
  }
  if (useV2) await log("graph.plan", { output: taskPlan });
  await checkpoint?.transition("discover", taskPlan);
  // Start with a small, stable catalog. The model—not a keyword router—loads
  // the business capabilities needed for the current question or Skill stage.
  // The full live catalog remains available to the backend for expansion.
  let tools = useV2
    ? mergeTools([schemaTool, adsCapabilityTool, ...initialAdsTools(live)], toolsForCapabilities(live, taskPlan.capabilities))
    : [schemaTool, adsCapabilityTool, ...initialAdsTools(live)];
  const liveToolNames = live.map(tool => tool.name);
  const exposedToolNames = tools.filter(tool => tool.name !== schemaTool.name).map(tool => tool.name);
  const exposedToolPayloadBytes = new TextEncoder().encode(JSON.stringify({ tools: tools.filter(tool => tool.name !== schemaTool.name) })).byteLength;
  const fullToolPayloadBytes = new TextEncoder().encode(JSON.stringify({ tools: live })).byteLength;
  await log("tools.snapshot", {
    output: {
      strategy: useV2 ? "ads-agent-v2-graph-capability-on-demand" : "capability-on-demand",
      liveToolCount: live.length,
      liveToolNames,
      exposedToolCount: exposedToolNames.length,
      exposedToolNames,
      liveReportTools: liveToolNames.filter(name => name.startsWith("reporting-")),
      exposedReportTools: exposedToolNames.filter(name => name.startsWith("reporting-")),
      reportsBlockedByRequest: false,
      exposedToolPayloadBytes,
      fullToolPayloadBytes,
      avoidedInitialPayloadBytes: Math.max(0, fullToolPayloadBytes - exposedToolPayloadBytes),
      toolResultLogLimitBytes: 60_000,
      toolResultModelLimitBytes: 450_000,
      exposedToolPayloadFitsModelLimit: exposedToolPayloadBytes <= 450_000,
    },
  });
  const cdxGuidance = cdxQuestion
    ? "\n这是活动组合筛选问题。请只基于已查询到的 Portfolio、Campaign、Ad Group 数据完成判断；不要创建或轮询广告报表，避免引入不必要的报表延迟。"
    : "";
  const messages: AgentMessage[] = [{ role: "user", content: typeof message === "string" ? `${message}${cdxGuidance}` : message }];
  if (useV2) messages.push({
    role: "user",
    content: `ADS AGENT V2 EXECUTION PLAN (server-validated): ${JSON.stringify(taskPlan)}. Execute every required stage with real Amazon Ads MCP evidence. The schemas for plan capabilities ${JSON.stringify(taskPlan.capabilities)} are already visible; do not call amazon_ads-load_capabilities for those same capabilities. Trust the verified selected-account context for marketplace, profile, timezone and currency when present. Treat this plan as workflow state, not as a request for the user to provide IDs already available from account-level discovery.`,
  });
  const resultCache = new Map<string, unknown>();
  const repeatCounts = new Map<string, number>();
  const loadedCapabilities = new Set<AdsCapability>(useV2 ? taskPlan.capabilities : []);
  let reportAttempts = 0;
  let round = 0;
  let verificationRetries = 0;
  let writeIntentRetries = 0;
  let successfulEvidenceCount = 0;
  const evidence: Array<{ tool: string; result: string }> = [];
  const maximumRounds = useV2 ? (skill ? 200 : 80) : 200;

  while (true) {
    if (round >= maximumRounds) throw new Error(`Ads Agent V2 exceeded the maximum of ${maximumRounds} graph rounds`);
    round++;
    await checkpoint?.transition("execute", { round, loadedCapabilities: [...loadedCapabilities], evidenceCount: successfulEvidenceCount });
    onStatus?.(round === 1
      ? `正在按实操规则分析，并提供 ${tools.length} 个实时 MCP 工具`
      : `正在基于第 ${round - 1} 轮真实查询结果继续分析`);
    const decision = await decide(userId, messages, tools, skill, accountContextBlock(row));
    await log("model.decision", { round, output: { content: decision.content, toolCalls: decision.toolCalls.map(call => ({ name: call.function.name, arguments: call.function.arguments })) } });
    if (!decision.toolCalls.length) {
      let content = decision.content.trim();
      if (!content) throw new Error("模型没有返回回答或工具调用");
      if (asksForKnownAccount(content)) content = selectedAccountClarification(row);
      if (useV2 && requiresWriteApprovalPolicy(requestText, content, taskPlan)) {
        writeIntentRetries++;
        if (writeIntentRetries > 3) throw new Error("Ads Agent V2 failed to submit the planned write operation for approval after 3 attempts.");
        await log("graph.write_pending", {
          round,
          output: { candidate: content.slice(0, 2000), attempt: writeIntentRetries },
          status: "retry",
        });
        messages.push({ role: "assistant", content });
        messages.push({
          role: "user",
          content: `ADS AGENT V2 WRITE NODE ${writeIntentRetries}/3: A textual plan is not an approval submission. Call exactly one currently visible Amazon Ads write tool now with the validated target ID and complete live-schema arguments. The server will intercept that call and create the human approval record; do not claim the change has executed.`,
        });
        continue;
      }
      const authoritativeZeroReport = useV2 && isAuthoritativeZeroReportAnswer(content, evidence);
      if (authoritativeZeroReport) {
        await log("graph.verdict", {
          round,
          output: { verdict: "pass", reason: "A completed Amazon report explicitly returned rowCount=0 and zero totalCost; the candidate accurately reports zero spend." },
          status: "success",
        });
      } else if (useV2 && successfulEvidenceCount > 0 && verificationRetries < 2) {
        await checkpoint?.transition("verify", { round, candidate: content.slice(0, 4000), evidenceCount: successfulEvidenceCount });
        try {
          const verdict = await verifyAdsV2Answer(userId, taskPlan, content, evidence, skill, accountContextBlock(row));
          await log("graph.verdict", { round, output: verdict, status: verdict.verdict === "pass" ? "success" : "retry" });
          if (verdict.verdict === "retry") {
            verificationRetries++;
            for (const capability of verdict.nextCapabilities) loadedCapabilities.add(capability);
            tools = mergeTools(tools, toolsForCapabilities(live, verdict.nextCapabilities));
            messages.push({ role: "assistant", content });
            messages.push({
              role: "user",
              content: `ADS AGENT V2 VERIFICATION RETRY ${verificationRetries}/2. ${verdict.instruction || verdict.reason} Missing evidence: ${verdict.missingEvidence.join("; ") || "not specified"}. Continue the same task with available MCP tools; do not repeat evidence already obtained.`,
            });
            continue;
          }
        } catch (error) {
          await log("graph.verdict.unavailable", { round, output: error instanceof Error ? error.message : String(error), status: "failure" });
        }
      }
      await checkpoint?.transition("deliver", { round, evidenceCount: successfulEvidenceCount, verificationRetries });
      return { type: "answer" as const, content, accountId: row.id, modelRounds: round };
    }

    // A Skill may name a real Amazon tool before its capability group has
    // been loaded. Expand that real tool's group automatically; genuinely
    // unknown names still follow the non-fatal unauthorized path below.
    const deferredLiveTools = decision.toolCalls
      .filter(call => !tools.some(candidate => candidate.name === call.function.name))
      .map(call => live.find(candidate => candidate.name === call.function.name))
      .filter((tool): tool is import("./amazon-mcp").McpTool => Boolean(tool));
    if (deferredLiveTools.length) {
      const capabilities = [...new Set(deferredLiveTools.map(tool => capabilityForToolName(tool.name)))];
      for (const capability of capabilities) loadedCapabilities.add(capability);
      tools = mergeTools(tools, toolsForCapabilities(live, capabilities));
      await log("tools.expanded", {
        round,
        output: {
          reason: "skill-or-model-requested-deferred-live-tool",
          capabilities,
          requestedToolNames: deferredLiveTools.map(tool => tool.name),
          exposedToolCount: tools.length - 1,
          exposedToolPayloadBytes: new TextEncoder().encode(JSON.stringify({ tools })).byteLength,
        },
      });
    }
    const unauthorized = decision.toolCalls.filter(call => !tools.some(candidate => candidate.name === call.function.name));
    if (unauthorized.length) {
      messages.push({ role: "assistant", content: decision.content || "", tool_calls: decision.toolCalls });
      for (const call of unauthorized) {
        await log("tool.unauthorized", {
          round,
          toolName: call.function.name,
          input: call.function.arguments,
          output: "Tool was not present in the authorized MCP catalog and was not executed.",
          status: "failure",
        });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.function.name,
          content: JSON.stringify({
            error: `Unauthorized tool: ${call.function.name}`,
            instruction: "This exact tool name is not present in the current Amazon Ads MCP catalog. Re-read the visible catalog, load the required business capability if needed, and continue the same task with an available tool.",
          }),
        });
      }
      onStatus?.(`已拦截未授权工具 ${unauthorized.map(call => call.function.name).join(", ")}，继续使用已授权的 Amazon Ads MCP 工具`);
    }
    const authorizedToolCalls = decision.toolCalls.filter(call => !unauthorized.includes(call));
    if (!authorizedToolCalls.length) continue;
    const resolved = authorizedToolCalls.map(call => {
      const tool = tools.find(candidate => candidate.name === call.function.name);
      if (!tool) throw new Error(`模型请求了未授权的工具：${call.function.name}`);
      const parsed = normalizeAmazonToolArguments(tool.name, parseArgs(call), tool.inputSchema);
      const args = tool.name.startsWith("reporting-") ? prepareReportToolArgs(tool.name, parsed) : parsed;
      return { call, tool, args };
    });
    const writes = resolved.filter(item => isWriteTool(item.tool.name));
    if (writes.length) {
      if (resolved.length !== 1 || writes.length !== 1) throw new Error("为保证安全，每轮只能提交一个写操作；请先完成查询确认再修改");
      const write = writes[0], id = crypto.randomUUID();
      const summary = decision.content.trim() || `准备执行 ${write.tool.name}。请核对目标账户、对象 ID 和参数后再批准。`;
      await d1().prepare(`INSERT INTO approvals(id,user_id,account_id,tool_name,tool_args,summary,status,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(id, userId, row.id, write.tool.name, JSON.stringify(write.args), summary, "pending", Date.now()).run();
      await log("approval.created", { round, toolName: write.tool.name, input: write.args, output: summary, status: "pending" });
      await checkpoint?.transition("approval", { round, approvalId: id, toolName: write.tool.name, args: write.args });
      return { type: "approval" as const, id, summary, toolName: write.tool.name, args: write.args, accountId: row.id, modelRounds: round };
    }

    messages.push({ role: "assistant", content: decision.content || "", tool_calls: decision.toolCalls });
    for (const item of resolved) {
      const key = stableKey(item.tool.name, item.args);
      const repeatCount = (repeatCounts.get(key) ?? 0) + 1;
      repeatCounts.set(key, repeatCount);
      // Re-reading one asynchronous report id is expected workflow progress,
      // not a duplicate business action. Keep the strict cap for ordinary
      // calls while allowing long-running Amazon reports to be resumed.
      const repeatLimit = item.tool.name === "reporting-retrieve_report" ? 50 : 3;
      if (repeatCount > repeatLimit) {
        messages.push({ role: "tool", tool_call_id: item.call.id, name: item.tool.name, content: JSON.stringify({
          error: "This exact MCP call has already been attempted three times in this Agent run.",
          instruction: "Use the existing result, change arguments according to the live schema, or ask for one genuinely missing business value.",
        }) });
        continue;
      }
      // Report state changes asynchronously; a cached PENDING response must
      // never replace a real follow-up request to Amazon.
      const bypassReadCache = item.tool.name === "reporting-retrieve_report";
      const cached = bypassReadCache ? undefined : resultCache.get(key);
      onStatus?.(cached === undefined ? `正在调用 ${item.tool.name}` : `正在复用本轮已取得的 ${item.tool.name} 结果`);
      await log("tool.start", { round, toolName: item.tool.name, input: item.args, status: "running" });
      let rawResult: unknown;
      try {
        const isReportCreate = item.tool.name === "reporting-create_report" || item.tool.name === "reporting-create_campaign_report";
        if (isReportCreate && ++reportAttempts > 3) {
          rawResult = { error: "本次 Agent 已尝试 3 次报表创建。请停止重复创建，继续查询已有 Report ID，或基于已有报告结果给出结论。" };
        } else if (cached !== undefined) {
          rawResult = cached;
        } else if (item.tool.name === schemaTool.name) {
          rawResult = {
            strategy: "capability-on-demand",
            instruction: `Call ${ADS_CAPABILITY_TOOL_NAME} with the business capabilities required for the next Skill stage.`,
            loadedCapabilities: [...loadedCapabilities],
            currentlyVisibleToolNames: tools.map(tool => tool.name),
            capabilities: capabilityCatalog(live),
          };
        } else if (item.tool.name === ADS_CAPABILITY_TOOL_NAME) {
          const requested = Array.isArray(item.args.capabilities)
            ? item.args.capabilities.filter((value): value is AdsCapability => typeof value === "string" && (ADS_CAPABILITIES as readonly string[]).includes(value))
            : [];
          if (!requested.length) throw new Error("At least one valid Amazon Ads capability is required.");
          for (const capability of requested) loadedCapabilities.add(capability);
          tools = mergeTools(tools, toolsForCapabilities(live, requested));
          const payloadBytes = new TextEncoder().encode(JSON.stringify({ tools })).byteLength;
          rawResult = {
            loadedCapabilities: [...loadedCapabilities],
            newlyRequestedCapabilities: requested,
            currentlyVisibleToolCount: tools.length,
            currentlyVisibleToolNames: tools.map(tool => tool.name),
            instruction: "Continue the same user request or Skill stage using the newly visible real Amazon Ads MCP tool schemas.",
          };
          await log("tools.expanded", {
            round,
            output: {
              reason: "model-selected-business-capability",
              capabilities: requested,
              exposedToolCount: tools.length - 1,
              exposedToolNames: tools.filter(tool => tool.name !== schemaTool.name).map(tool => tool.name),
              exposedToolPayloadBytes: payloadBytes,
            },
          });
        } else {
          rawResult = await callReadTool(clients[modeForTool(item.tool.name)], item.tool.name, item.args, userId, row.id, onStatus);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        messages.push({ role: "tool", tool_call_id: item.call.id, name: item.tool.name, content: JSON.stringify({
          error: message,
          instruction: "The MCP call failed. Re-read the live tool schema, correct only unsupported or missing arguments, and continue the same business request. Do not require an object API ID for an account-level report question.",
        }) });
        onStatus?.(`MCP ${item.tool.name} 调用失败，Agent 正在根据实时 Schema 自动修正参数`);
        await log("tool.error", { round, toolName: item.tool.name, input: item.args, output: message, status: "failure" });
        continue;
      }
      const embeddedToolError = mcpResultError(rawResult);
      if (embeddedToolError) {
        messages.push({ role: "tool", tool_call_id: item.call.id, name: item.tool.name, content: JSON.stringify({
          error: embeddedToolError,
          instruction: "Amazon MCP returned an error result. Correct the call from the currently visible live schema or choose another valid tool for the same business goal, then continue.",
        }) });
        await log("tool.error", { round, toolName: item.tool.name, input: item.args, output: embeddedToolError, status: "failure" });
        await checkpoint?.transition("verify", { round, toolName: item.tool.name, status: "failure", error: embeddedToolError });
        continue;
      }
      if (!bypassReadCache && cached === undefined && item.tool.name !== schemaTool.name && item.tool.name !== ADS_CAPABILITY_TOOL_NAME) resultCache.set(key, rawResult);
      await d1().prepare(`INSERT INTO audit_logs(id,user_id,account_id,action,target,detail,outcome,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), userId, row.id, "tool.read", item.tool.name, JSON.stringify(item.args).slice(0, 12000), "success", Date.now()).run();
      const result = item.tool.name.startsWith("reporting-") ? compactReportForModel(rawResult) : rawResult;
      const serialized = JSON.stringify(result) || "null";
      if (item.tool.name !== schemaTool.name && item.tool.name !== ADS_CAPABILITY_TOOL_NAME && hasUsableEvidence(result)) {
        successfulEvidenceCount++;
        evidence.push({ tool: item.tool.name, result: serialized.slice(0, 60_000) });
      }
      await checkpoint?.transition("verify", { round, toolName: item.tool.name, status: "success", evidenceCount: successfulEvidenceCount });
      await log("tool.result", { round, toolName: item.tool.name, input: item.args, output: result, status: "success" });
      messages.push({ role: "tool", tool_call_id: item.call.id, name: item.tool.name, content: serialized.length > 450_000 ? `${serialized.slice(0, 450_000)}\n[工具结果已在 450000 字符处截断；请使用汇总字段回答]` : serialized });
    }
  }
}

async function createAdsV2Plan(
  userId: string,
  messages: AgentMessage[],
  skill: ActiveSkill | undefined,
  accountContext: string,
): Promise<AdsTaskPlan> {
  const reply = await decide(userId, messages, [adsV2PlanTool], skill, accountContext, {
    toolChoice: { type: "function", function: { name: ADS_V2_PLAN_TOOL } },
    operation: "ads.v2.plan",
    systemSuffix: "ADS AGENT V2 PLANNING NODE: Do not execute tools yet. Convert the complete user request or selected Skill into a structured plan. The model, not a keyword router, chooses the business capabilities. A write plan must require approval.",
  });
  const call = reply.toolCalls.find(item => item.function.name === ADS_V2_PLAN_TOOL);
  if (!call) throw new Error("The model did not return the required Amazon Ads V2 structured plan.");
  return parseAdsTaskPlan(call);
}

async function verifyAdsV2Answer(
  userId: string,
  plan: AdsTaskPlan,
  candidate: string,
  evidence: Array<{ tool: string; result: string }>,
  skill: ActiveSkill | undefined,
  accountContext: string,
) {
  const compactEvidence = evidence.slice(-16).map(item => ({ tool: item.tool, result: item.result.slice(0, 12_000) }));
  const message = JSON.stringify({ plan, candidate, evidence: compactEvidence });
  const reply = await decide(userId, [{ role: "user", content: message }], [adsV2VerdictTool], skill, accountContext, {
    toolChoice: { type: "function", function: { name: ADS_V2_VERDICT_TOOL } },
    operation: "ads.v2.verify",
    systemSuffix: "ADS AGENT V2 VERIFICATION NODE: Judge only whether the candidate answers the user's goal using the supplied tool evidence. PASS valid zero-row/zero-spend report results. RETRY only when a specific missing fact can be obtained from an available Amazon Ads capability. Never invent values.",
  });
  const call = reply.toolCalls.find(item => item.function.name === ADS_V2_VERDICT_TOOL);
  if (!call) throw new Error("The model did not return the required Amazon Ads V2 verification verdict.");
  return parseAdsAnswerVerdict(call);
}

export async function planAgent(
  userId: string,
  accountId: string | undefined,
  message: ModelContent,
  onStatus?: (text: string) => void,
  skill?: ActiveSkill,
  plainMessage?: string,
  conversationId?: string,
  version: "v1" | "v2" = "v2",
) {
  const runId = await startAgentLog(userId, "ads", message, accountId);
  const checkpoint = version === "v2" ? adsV2Checkpoint(`${userId}:${accountId ?? "pending"}:${conversationId ?? runId}`, runId) : undefined;
  await checkpoint?.begin({ userId, accountId: accountId ?? null, conversationId: conversationId ?? null, version: "ads-agent-v2" });
  try {
    const result = await planAgentCore(userId, accountId, message, onStatus, skill, plainMessage, runId, checkpoint, version);
    await finishAgentLog(userId, "ads", runId, result.type, result, result.accountId);
    await checkpoint?.finish(result.type, result);
    return result;
  } catch (error) {
    await finishAgentLog(userId, "ads", runId, "failure", error instanceof Error ? error.message : String(error), accountId);
    await checkpoint?.finish("failure", error instanceof Error ? error.message : String(error));
    throw error;
  }
}
