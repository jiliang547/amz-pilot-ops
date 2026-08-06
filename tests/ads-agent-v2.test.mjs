import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [v2, agent, state, worker, config, reportJobs, schemaNormalizer, approvalRoute] = await Promise.all([
  readFile(new URL("../lib/ads-agent-v2.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/agent.ts", import.meta.url), "utf8"),
  readFile(new URL("../worker/ads-agent-state.ts", import.meta.url), "utf8"),
  readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../wrangler.deploy.json", import.meta.url), "utf8"),
  readFile(new URL("../lib/report-jobs.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tool-schema.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/approvals/[id]/execute/route.ts", import.meta.url), "utf8"),
]);

test("defines structured planning and semantic verification nodes", () => {
  assert.match(v2, /amazon_ads-v2-submit_plan/);
  assert.match(v2, /amazon_ads-v2-submit_verdict/);
  assert.match(v2, /requiresApproval: operation === "write"/);
  assert.match(agent, /ads\.v2\.plan/);
  assert.match(agent, /ads\.v2\.verify/);
  assert.match(agent, /graph\.verdict/);
});

test("treats successful transports containing MCP errors as failed evidence", () => {
  assert.match(v2, /export function mcpResultError/);
  assert.match(v2, /object\.isError !== true/);
  assert.match(agent, /const embeddedToolError = mcpResultError\(rawResult\)/);
  assert.match(agent, /status: "failure", error: embeddedToolError/);
});

test("persists per-conversation V2 graph checkpoints in a SQLite Durable Object", () => {
  assert.match(state, /CREATE TABLE IF NOT EXISTS runs/);
  assert.match(state, /CREATE TABLE IF NOT EXISTS transitions/);
  assert.match(worker, /export \{ AdsAgentState \}/);
  const parsed = JSON.parse(config);
  assert.ok(parsed.durable_objects.bindings.some(item => item.name === "ADS_AGENT_STATE" && item.class_name === "AdsAgentState"));
  assert.equal(parsed.exports.AdsAgentState.storage, "sqlite");
});

test("uses bounded graph rounds and preserves Skill headroom", () => {
  assert.match(agent, /const maximumRounds = useV2 \? \(skill \? 200 : 80\) : 200/);
  assert.match(agent, /Ads Agent V2 exceeded the maximum/);
  assert.match(agent, /verificationRetries < 2/);
});

test("accepts completed zero-spend reports without speculative retry", () => {
  assert.match(agent, /function isAuthoritativeZeroReportAnswer/);
  assert.match(agent, /report\.status !== "COMPLETED"/);
  assert.match(agent, /Number\(aggregates\.totalCost\) === 0/);
  assert.match(agent, /const authoritativeZeroReport = useV2/);
});

test("normalizes specialized campaign report arguments before logging and execution", () => {
  assert.match(reportJobs, /export function prepareReportToolArgs/);
  assert.match(reportJobs, /copy\.query = \{\}/);
  assert.match(agent, /prepareReportToolArgs\(tool\.name, parsed\)/);
});

test("allows asynchronous report retrieval to outlive create-call safeguards", () => {
  assert.match(agent, /item\.tool\.name === "reporting-retrieve_report" \? 50 : 3/);
  assert.match(agent, /const isReportCreate = item\.tool\.name === "reporting-create_report" \|\| item\.tool\.name === "reporting-create_campaign_report"/);
  assert.match(agent, /const bypassReadCache = item\.tool\.name === "reporting-retrieve_report"/);
  assert.match(agent, /const cached = bypassReadCache \? undefined : resultCache\.get\(key\)/);
  assert.doesNotMatch(agent, /item\.tool\.name\.startsWith\("reporting-"\) && \+\+reportAttempts/);
});

test("does not deliver a write task before a real approval record exists", () => {
  assert.match(agent, /plan\.requiresApproval/);
  assert.match(agent, /requiresWriteApprovalPolicy\(requestText, content, taskPlan\)/);
  assert.match(agent, /A textual plan is not an approval submission/);
  assert.match(agent, /graph\.write_pending/);
  assert.match(agent, /INSERT INTO approvals/);
});

test("normalizes writes against live schemas and rejects embedded batch errors", () => {
  assert.match(schemaNormalizer, /additionalProperties !== false/);
  assert.match(schemaNormalizer, /delete copy\.adProduct/);
  assert.match(agent, /normalizeAmazonToolArguments\(tool\.name, parseArgs\(call\), tool\.inputSchema\)/);
  assert.match(approvalRoute, /normalizeAmazonToolArguments\(action\.toolName, action\.args, schema\)/);
  assert.match(approvalRoute, /const writeError = mcpResultError\(writeResult\)/);
  assert.match(v2, /normalized === "errors"/);
  assert.match(v2, /JSON\.parse\(trimmed\); return false/);
});
