import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("deploys the enhanced ads agent as an independent durable workflow", async () => {
  const [workflow, config, worker, page] = await Promise.all([
    source("worker/enhanced-ads-workflow.ts"),
    source("wrangler.deploy.json"),
    source("worker/index.ts"),
    source("app/page.tsx"),
  ]);
  const parsed = JSON.parse(config);
  assert.ok(parsed.workflows.some((item) => item.binding === "ENHANCED_ADS_WORKFLOW" && item.class_name === "EnhancedAdsWorkflow"));
  assert.match(worker, /export \{ EnhancedAdsWorkflow \}/);
  assert.match(workflow, /extends WorkflowEntrypoint/);
  assert.match(workflow, /MAX_ROUNDS = 80/);
  assert.match(page, /增强型智能广告/);
  assert.match(page, /<EnhancedAdsView/);
});

test("follows the Amazon workshop tool discovery and ReAct call chain", async () => {
  const [workflow, model, amazon] = await Promise.all([
    source("worker/enhanced-ads-workflow.ts"),
    source("lib/enhanced-ads-model.ts"),
    source("lib/amazon-mcp.ts"),
  ]);
  assert.match(workflow, /\.listTools\(\)/);
  assert.match(workflow, /tools\.find\(\(item\) => item\.name === call\.function\.name\)/);
  assert.match(workflow, /normalizeAmazonToolArguments/);
  assert.match(workflow, /messages\.push\(\{ role: "tool"/);
  assert.match(model, /tool_choice: "auto"/);
  assert.match(model, /parameters: tool\.inputSchema/);
  assert.match(amazon, /method:"tools\/list"/);
});

test("keeps long reports off the browser connection and aggregates full CSV data", async () => {
  const [workflow, route, reportJobs, view] = await Promise.all([
    source("worker/enhanced-ads-workflow.ts"),
    source("app/api/enhanced-ads/runs/route.ts"),
    source("lib/report-jobs.ts"),
    source("app/enhanced-ads-view.tsx"),
  ]);
  assert.match(route, /ENHANCED_ADS_WORKFLOW/);
  assert.match(route, /status: "queued"/);
  assert.match(view, /setTimeout\(\(\) => \{ void poll/);
  assert.match(workflow, /executeReportTool/);
  assert.match(workflow, /withDeterministicAnalysis/);
  assert.match(workflow, /highestFiniteAcos/);
  assert.match(reportJobs, /summarizeAdsCsv/);
});

test("persists approvals and a complete seven-day-compatible trace", async () => {
  const [workflow, db, approval, logs] = await Promise.all([
    source("worker/enhanced-ads-workflow.ts"),
    source("lib/db.ts"),
    source("app/api/enhanced-ads/runs/[id]/approval/route.ts"),
    source("lib/agent-logs.ts"),
  ]);
  assert.match(workflow, /step\.waitForEvent<ApprovalPayload>/);
  assert.match(workflow, /isWriteTool/);
  assert.match(approval, /sendEvent\(\{ type: "approval"/);
  assert.match(db, /enhanced_ads_runs/);
  assert.match(db, /enhanced_ads_events/);
  assert.match(logs, /"enhanced-ads"/);
});

test("routes the enhanced agent to the Cloudflare Python LangGraph runtime when configured", async () => {
  const [workflow, bridge, pythonAgent, requirements] = await Promise.all([
    source("worker/enhanced-ads-workflow.ts"),
    source("lib/cloudflare-ads-agent.ts"),
    source("agentcore/ads-agent/ads_agent.py"),
    source("agentcore/ads-agent/requirements.txt"),
  ]);
  assert.match(workflow, /cloudflareAdsAgentConfigured\(\)/);
  assert.match(workflow, /startCloudflareAdsAgentJob/);
  assert.match(workflow, /pollCloudflareAdsAgentJob/);
  assert.match(workflow, /step\.sleep/);
  assert.match(workflow, /amazonAdsAccessToken/);
  assert.match(bridge, /ENHANCED_ADS_CONTAINER/);
  assert.match(bridge, /getByName\("enhanced-ads-langgraph-v1"\)/);
  assert.match(pythonAgent, /MultiServerMCPClient/);
  assert.match(pythonAgent, /create_agent/);
  assert.match(pythonAgent, /ChatOpenAI/);
  assert.match(pythonAgent, /@app\.post\("\/"\)/);
  assert.match(pythonAgent, /@app\.post\("\/jobs\/\{job_id\}"\)/);
  assert.match(requirements, /langgraph/);
  assert.match(requirements, /langchain-mcp-adapters/);
});

test("sends only short-lived Amazon credentials to the LangGraph container", async () => {
  const [workflow, bridge] = await Promise.all([
    source("worker/enhanced-ads-workflow.ts"),
    source("lib/cloudflare-ads-agent.ts"),
  ]);
  assert.match(workflow, /amazonAdsAccessToken\(credentials\)/);
  assert.match(bridge, /access_token: input\.accessToken/);
  assert.doesNotMatch(bridge, /refresh_token/);
  assert.doesNotMatch(bridge, /client_secret/);
});

test("declares a dedicated basic Cloudflare Container for the Python agent", async () => {
  const [config, worker, dockerfile] = await Promise.all([
    source("wrangler.deploy.json"),
    source("worker/index.ts"),
    source("agentcore/ads-agent/Dockerfile"),
  ]);
  const parsed = JSON.parse(config);
  assert.ok(parsed.containers.some((item) => item.class_name === "EnhancedAdsContainer" && item.instance_type === "basic"));
  assert.ok(parsed.durable_objects.bindings.some((item) => item.name === "ENHANCED_ADS_CONTAINER"));
  assert.match(worker, /EnhancedAdsContainer/);
  assert.match(dockerfile, /python:3\.13-slim/);
});

test("supports enhanced-ads-only OAuth 2.1 while preserving manual account setup", async () => {
  const [oauth, start, callback, view, accounts, db] = await Promise.all([
    source("lib/amazon-ads-oauth.ts"),
    source("app/api/enhanced-ads/oauth/start/route.ts"),
    source("app/api/enhanced-ads/oauth/callback/route.ts"),
    source("app/enhanced-ads-view.tsx"),
    source("app/api/accounts/route.ts"),
    source("lib/db.ts"),
  ]);
  assert.match(oauth, /advertising::campaign_management/);
  assert.match(oauth, /code_challenge_method/);
  assert.match(start, /pkceChallenge/);
  assert.match(start, /enhanced_ads_oauth_states/);
  assert.match(callback, /exchangeAuthorizationCode/);
  assert.match(callback, /saveOAuthAccounts/);
  assert.match(view, /Amazon 跳转授权/);
  assert.match(view, /手动配置/);
  assert.match(accounts, /refreshToken/);
  assert.match(db, /enhanced_ads_oauth_states/);
});
