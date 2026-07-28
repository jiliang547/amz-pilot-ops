import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("stores per-user model keys only through the encrypted server route", async () => {
  const [page, route, config, schema] = await Promise.all([
    source("app/page.tsx"),
    source("app/api/model-settings/route.ts"),
    source("lib/model-config.ts"),
    source("db/schema.ts"),
  ]);
  assert.match(page, /配置大模型/);
  assert.match(page, /name="apiKey" type="password"/);
  assert.doesNotMatch(page, /localStorage|sessionStorage/);
  assert.match(route, /encryptJson\(\{ apiKey \}\)/);
  assert.doesNotMatch(route, /Response\.json\(\{\s*apiKey\b/);
  assert.match(config, /decryptJson<StoredSecret>/);
  assert.match(schema, /model_settings/);
});

test("accepts the five Amazon credentials and discovers display metadata", async () => {
  const [page, route] = await Promise.all([
    source("app/page.tsx"),
    source("app/api/accounts/route.ts"),
  ]);
  for (const field of ["profileId", "region", "clientId", "clientSecret", "refreshToken"]) {
    assert.match(page, new RegExp(`name="${field}"`));
  }
  assert.doesNotMatch(page, /name="name" placeholder="例如 Voicewell/);
  assert.doesNotMatch(page, /name="advertiserAccountId"/);
  assert.match(route, /ads_accounts-list_ads_accounts/);
  assert.match(route, /advertiserAccountDiscovered/);
  assert.match(route, /encryptJson\(credentials\)/);
});
test("uses the full streaming MCP agent loop and completes asynchronous reports", async () => {
  const [model, agent, route, amazon, playbook, report] = await Promise.all([
    source("lib/model.ts"),
    source("lib/agent.ts"),
    source("app/api/chat/route.ts"),
    source("lib/amazon-mcp.ts"),
    source("lib/amazon-playbook.ts"),
    source("lib/report-jobs.ts"),
  ]);
  assert.match(model, /stream:\s*true/);
  assert.doesNotMatch(model, /compactSchema|streamAnswer/);
  assert.match(model, /parameters: tool\.inputSchema/);
  assert.match(agent, /while \(true\)/);
  assert.doesNotMatch(agent, /step < 4|slice\(0, 3\)|selectToolsForMessage/);
  assert.match(agent, /messages\.push\(\{ role: "tool"/);
  assert.match(agent, /executeReportTool/);
  assert.match(report, /POLL_INTERVAL_MS = 15_000/);
  assert.match(report, /report_jobs/);
  assert.match(route, /planAgent\(user\.id/);
  assert.doesNotMatch(route, /finalMessages|streamAnswer/);
  assert.match(amazon, /campaign_management-query_portfolio/);
  assert.match(playbook, /今天总花费/);
  assert.match(playbook, /查询轮数不设硬上限/);
  assert.match(report, /downloadedReports/);
  assert.match(report, /aggregates/);
});
test("uploads account-isolated custom Skills and applies only the selected Skill", async () => {
  const [page, skillRoute, skillItemRoute, helper, chat, model, schema] = await Promise.all([
    source("app/page.tsx"),
    source("app/api/skills/route.ts"),
    source("app/api/skills/[id]/route.ts"),
    source("lib/custom-skills.ts"),
    source("app/api/chat/route.ts"),
    source("lib/model.ts"),
    source("db/schema.ts"),
  ]);
  assert.match(page, /上传 \/ 管理 Skill/);
  assert.match(page, /skillId:selectedSkill\?\.id/);
  assert.match(page, /SKILL\.md、Markdown、TXT 或 JSON/);
  assert.match(skillRoute, /requireUser\(request\)/);
  assert.match(skillRoute, /bucket\.put/);
  assert.match(skillRoute, /INSERT INTO custom_skills/);
  assert.match(skillItemRoute, /WHERE id=\? AND user_id=\?/);
  assert.match(helper, /parseSkillDocument/);
  assert.match(helper, /不能要求读取或泄露密钥、绕过人工审批/);
  assert.match(chat, /activeSkillForUser\(user\.id, skillId\)/);
  assert.match(model, /skillSystemBlock\(skill\)/);
  assert.match(schema, /customSkills/);
});
test("routes standard metric reports through backend aggregation without model tokens", async () => {
  const [fast, agent, report, chat] = await Promise.all([
    source("lib/fast-report.ts"),
    source("lib/agent.ts"),
    source("lib/report-jobs.ts"),
    source("app/api/chat/route.ts"),
  ]);
  assert.match(fast, /isFastAggregateReport/);
  assert.match(fast, /reporting-create_campaign_report/);
  assert.match(fast, /modelRounds: 0/);
  assert.match(fast, /没有调用大模型/);
  assert.match(agent, /compactReportForModel/);
  assert.doesNotMatch(report, /csvPreview:/);
  assert.match(report, /item\.matchAll/);
  assert.match(report, /CREATE_UNCERTAIN/);
  assert.match(chat, /chat_execution_failed/);
});

test("greetings stay local and model cache prefix is stable within a day", async () => {
  const agent = await source("lib/agent.ts");
  const model = await source("lib/model.ts");
  assert.match(agent, /tryLocalConversation/);
  assert.match(agent, /modelRounds:\s*0,\s*localPath:\s*true/);
  assert.match(agent, /未调用大模型或 Amazon MCP/);
  assert.match(model, /toISOString\(\)\.slice\(0,\s*10\)/);
  assert.doesNotMatch(model, /当前服务器 UTC 时间：\$\{new Date\(\)\.toISOString\(\)\}/);
  assert.match(model, /model_request_metrics/);
});
test("compiles all verified Amazon MCP tools into low-token backend skills", async () => {
  const [compiled, agent, page, approval, verification, scheduler] = await Promise.all([
    source("lib/compiled-skills.ts"),
    source("lib/agent.ts"),
    source("app/page.tsx"),
  ]);
  const tools = [
    "ads_accounts-list_ads_accounts",
    "campaign_management-query_campaign", "campaign_management-query_ad_group", "campaign_management-query_ad", "campaign_management-query_target", "campaign_management-query_portfolio",
    "campaign_management-create_campaign", "campaign_management-create_ad_group", "campaign_management-create_ad", "campaign_management-create_target",
    "campaign_management-update_campaign", "campaign_management-update_ad_group", "campaign_management-update_ad", "campaign_management-update_target", "campaign_management-update_target_bid", "campaign_management-delete_target",
    "reporting-create_campaign_report", "reporting-create_report", "reporting-retrieve_report",
  ];
  for (const tool of tools) assert.match(compiled, new RegExp(tool));
  assert.match(compiled, /deterministicPlan/);
  assert.match(compiled, /compiled_skill_planner_metrics/);
  assert.match(compiled, /cachedTools/);
  assert.doesNotMatch(compiled, /AMAZON_ADS_PLAYBOOK|tool\.inputSchema/);
  assert.match(compiled, /INSERT INTO approvals/);
  assert.match(compiled, /executeReportTool/);
  assert.match(agent, /tryCompiledSkill/);
  assert.match(page, /内置后端 Skill · 低 Token/);
});
test("routes campaign ranking questions through backend CSV grouping", async () => {
  const [ranked, agent, reports, compiled] = await Promise.all([
    source("lib/ranked-report.ts"),
    source("lib/agent.ts"),
    source("lib/report-jobs.ts"),
    source("lib/compiled-skills.ts"),
  ]);
  assert.match(ranked, /昨天\|昨日\|yesterday/);
  assert.match(ranked, /最高\|最低/);
  assert.match(ranked, /reporting-create_campaign_report/);
  assert.match(ranked, /mergeGroups/);
  assert.match(ranked, /modelRounds: 0/);
  assert.match(agent, /tryRankedCampaignReport/);
  assert.ok(agent.indexOf("tryRankedCampaignReport") < agent.indexOf("tryFastAggregateReport({"));
  assert.match(reports, /campaignIdIndex/);
  assert.match(reports, /campaignNameIndex/);
  assert.match(reports, /summary\.groups/);
  assert.match(compiled, /哪个\|哪一个\|最高\|最低/);
});
test("maintains daily ad facts, refreshes attribution, and computes dashboard windows locally", async () => {
  const [snapshots, adsApi, scheduler, agent, dashboard, page, schema, worker] = await Promise.all([
    source("lib/snapshot-reports.ts"), source("lib/amazon-ads-api.ts"), source("lib/scheduler.ts"), source("lib/agent.ts"),
    source("app/api/dashboard/route.ts"), source("app/page.tsx"), source("db/schema.ts"), source("worker/index.ts"),
  ]);
  for (const key of ["1d", "7d", "30d", "90d"]) assert.match(snapshots, new RegExp(`key: "${key}"`));
  assert.match(snapshots, /modelRounds:\s*0,\s*snapshotPath:\s*true/);
  assert.match(snapshots, /executeDirectCampaignReport/);
  assert.doesNotMatch(snapshots, /reporting-create_campaign_report/);
  assert.match(snapshots, /ROLLING_ATTRIBUTION_DAYS = 15/);
  assert.match(snapshots, /initialStart = shiftDate\(endDate, -89\)/);
  assert.match(snapshots, /ON CONFLICT\(account_id,report_date,campaign_id,ad_group_id\) DO UPDATE/);
  assert.match(snapshots, /sync_id<>\?/);
  assert.match(snapshots, /DELETE FROM report_snapshots WHERE account_id=\?/);
  assert.match(adsApi, /\/reporting\/reports/);
  assert.match(adsApi, /application\/vnd\.createasyncreportrequest\.v3\+json/);
  assert.match(adsApi, /reportTypeId: "spCampaigns"/);
  assert.match(adsApi, /Amazon-Advertising-API-Scope/);
  assert.match(adsApi, /expires_in/);
  assert.match(adsApi, /DecompressionStream\("gzip"\)/);
  assert.doesNotMatch(snapshots, /Promise\.all\(WINDOWS\.map/);
  assert.match(snapshots, /aggregateWindow/);
  assert.match(snapshots, /RAW_REPORT_RETENTION_DAYS = 30/);
  assert.match(scheduler, /runDailyReportSnapshots/);
  assert.match(snapshots, /runManualReportSnapshots/);
  assert.ok(agent.indexOf("trySavedSnapshotQuery") < agent.indexOf("tryRankedCampaignReport({"));
  assert.match(dashboard, /dashboardData/);
  assert.match(dashboard, /export async function POST/);
  assert.match(page, /广告数据看板/);
  assert.match(page, /refreshDashboard/);
  assert.match(page, /刷新每日数据/);
  assert.match(page, /analyzeDashboard/);
  assert.match(schema, /ad_daily_facts/);
  assert.match(schema, /ad_data_syncs/);
  assert.match(worker, /async scheduled/);
});