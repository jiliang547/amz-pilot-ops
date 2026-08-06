import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("supports encrypted personal and admin preset models with role isolation", async () => {
  const [page, ui, route, adminRoute, config, schema] = await Promise.all([
    source("app/page.tsx"),
    source("app/model-settings-ui.tsx"),
    source("app/api/model-settings/route.ts"),
    source("app/api/admin/models/route.ts"),
    source("lib/model-config.ts"),
    source("db/schema.ts"),
  ]);
  assert.match(page, /user\.role === "admin"/);
  assert.match(page, /网站模型管理/);
  assert.match(page, /ModelSelector/);
  assert.match(ui, /网站预设模型/);
  assert.match(ui, /name="apiKey"/);
  assert.doesNotMatch(page, /localStorage|sessionStorage/);
  assert.match(route, /encryptJson\(\{ apiKey \}\)/);
  assert.doesNotMatch(route, /Response\.json\(\{\s*apiKey\b/);
  assert.match(adminRoute, /user\.role !== "admin"/);
  assert.match(adminRoute, /site_models/);
  assert.doesNotMatch(adminRoute, /encrypted_api_key encryptedApiKey/);
  assert.match(config, /decryptJson<StoredSecret>/);
  assert.match(config, /user_model_selections/);
  assert.match(config, /source: "preset"/);
  assert.match(schema, /model_settings/);
  assert.match(schema, /site_models/);
  assert.match(schema, /user_model_selections/);
});

test("accepts the five Amazon credentials and discovers display metadata", async () => {
  const [page, route] = await Promise.all([
    source("app/page.tsx"),
    source("app/api/accounts/route.ts"),
  ]);
  for (const field of [
    "profileId",
    "region",
    "clientId",
    "clientSecret",
    "refreshToken",
  ]) {
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
  assert.match(agent, /initialAdsTools/);
  assert.match(agent, /toolsForCapabilities/);
  assert.match(agent, /messages\.push\(\{ role: "tool"/);
  assert.match(agent, /executeReportTool/);
  assert.match(report, /POLL_INTERVAL_MS = 15_000/);
  assert.match(report, /report_jobs/);
  assert.match(route, /planAgent\(user\.id/);
  assert.doesNotMatch(route, /finalMessages|streamAnswer/);
  assert.match(amazon, /method:"tools\/list"/);
  assert.match(playbook, /今天总花费/);
  assert.match(playbook, /查询轮数不设硬上限/);
  assert.match(report, /downloadedReports/);
  assert.match(report, /aggregates/);
});
test("uploads account-isolated custom Skills and applies only the selected Skill", async () => {
  const [page, skillRoute, skillItemRoute, helper, chat, model, schema] =
    await Promise.all([
      source("app/page.tsx"),
      source("app/api/skills/route.ts"),
      source("app/api/skills/[id]/route.ts"),
      source("lib/custom-skills.ts"),
      source("app/api/chat/route.ts"),
      source("lib/model.ts"),
      source("db/schema.ts"),
    ]);
  assert.match(page, /上传 \/ 管理 Skill/);
  assert.match(page, /skillId:\s*selectedSkill\?\.id/);
  assert.match(page, /SKILL\.md、Markdown、TXT\s*或\s*JSON/);
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
  assert.doesNotMatch(
    model,
    /当前服务器 UTC 时间：\$\{new Date\(\)\.toISOString\(\)\}/,
  );
  assert.match(model, /model_request_metrics/);
});
test("records private model token usage and exposes Beijing seven-day totals", async () => {
  const [schema, usage, route, page, ui, model, listing, imageWorkflow, imageRoute] =
    await Promise.all([
      source("db/schema.ts"),
      source("lib/token-usage.ts"),
      source("app/api/token-usage/route.ts"),
      source("app/page.tsx"),
      source("app/token-usage-ui.tsx"),
      source("lib/model.ts"),
      source("lib/listing-workflow.ts"),
      source("lib/image-requirements-workflow.ts"),
      source("app/api/image-generate/route.ts"),
    ]);
  assert.match(schema, /model_token_usage/);
  assert.match(usage, /recordTokenUsage/);
  assert.match(route, /requireUser\(request\)/);
  assert.match(route, /user_id=\?/);
  assert.match(route, /\+8 hours/);
  assert.match(route, /length: 7/);
  assert.match(page, /TokenUsageButton/);
  assert.match(ui, /近 7 天总用量/);
  assert.match(ui, /上传（输入）/);
  assert.match(ui, /下载（输出）/);
  for (const modelPath of [model, listing, imageWorkflow, imageRoute])
    assert.match(modelPath, /recordTokenUsage/);
});
test("uses the MCP agent for verified Amazon Ads tools", async () => {
  const [agent, page] =
    await Promise.all([
      source("lib/agent.ts"),
      source("app/page.tsx"),
    ]);
  const tools = [
    "ads_accounts-list_ads_accounts",
    "campaign_management-query_campaign",
    "campaign_management-query_ad_group",
    "campaign_management-query_ad",
    "campaign_management-query_target",
    "campaign_management-query_portfolio",
    "campaign_management-create_campaign",
    "campaign_management-create_ad_group",
    "campaign_management-create_ad",
    "campaign_management-create_target",
    "campaign_management-update_campaign",
    "campaign_management-update_ad_group",
    "campaign_management-update_ad",
    "campaign_management-update_target",
    "campaign_management-update_target_bid",
    "campaign_management-delete_target",
    "reporting-create_campaign_report",
    "reporting-create_report",
    "reporting-retrieve_report",
  ];
  assert.match(agent, /executeReportTool/);
  assert.match(agent, /capability-on-demand/);
  assert.match(agent, /amazon_ads-load_capabilities|ADS_CAPABILITY_TOOL_NAME/);
  assert.match(agent, /tools\.expanded/);
  assert.match(agent, /const maximumRounds = useV2 \? \(skill \? 200 : 80\) : 200/);
  assert.match(agent, /The MCP call failed/);
  assert.match(page, /内置运营模板 · MCP Agent/);
});

test("treats an empty write verification query as a failed write", async () => {
  const verification = await source("lib/write-verification.ts");
  assert.match(verification, /containsId/);
  assert.match(verification, /写入回查未找到/);
  assert.match(verification, /写入响应缺少/);
});

test("routes campaign ranking questions through backend CSV grouping", async () => {
  const [ranked, agent, reports, workflow] = await Promise.all([
    source("lib/ranked-report.ts"),
    source("lib/agent.ts"),
    source("lib/report-jobs.ts"),
    source("lib/ads-workflow.ts"),
  ]);
  assert.match(ranked, /昨天\|昨日\|yesterday/);
  assert.match(ranked, /最高\|最低/);
  assert.match(ranked, /reporting-create_campaign_report/);
  assert.match(ranked, /mergeGroups/);
  assert.match(ranked, /modelRounds: 0/);
  assert.doesNotMatch(
    agent,
    /tryRankedCampaignReport|tryFastAggregateReport|trySavedSnapshotQuery/,
  );
  assert.match(agent, /toolsForCapabilities/);
  assert.match(reports, /summarizeAdsCsv/);
  assert.match(workflow, /dimensions/);
  assert.match(workflow, /searchTerm/);
  assert.match(workflow, /campaignId/);
});
test("maintains daily ad facts, refreshes attribution, and computes dashboard windows locally", async () => {
  const [
    snapshots,
    adsApi,
    scheduler,
    agent,
    dashboard,
    page,
    dashboardView,
    schema,
    worker,
  ] = await Promise.all([
    source("lib/snapshot-reports.ts"),
    source("lib/amazon-ads-api.ts"),
    source("lib/scheduler.ts"),
    source("lib/agent.ts"),
    source("app/api/dashboard/route.ts"),
    source("app/page.tsx"),
    source("app/dashboard-view.tsx"),
    source("db/schema.ts"),
    source("worker/index.ts"),
  ]);
  for (const key of ["1d", "7d", "30d", "90d"])
    assert.match(snapshots, new RegExp(`key: "${key}"`));
  assert.match(snapshots, /modelRounds:\s*0,\s*snapshotPath:\s*true/);
  assert.match(snapshots, /executeDirectReport/);
  assert.doesNotMatch(snapshots, /reporting-create_campaign_report/);
  assert.match(snapshots, /ROLLING_ATTRIBUTION_DAYS = 15/);
  assert.match(snapshots, /initialStart = shiftDate\(endDate, -89\)/);
  assert.match(
    snapshots,
    /ON CONFLICT\(account_id,report_date,campaign_id,ad_group_id\) DO UPDATE/,
  );
  assert.match(snapshots, /sync_id<>\?/);
  assert.match(snapshots, /DELETE FROM report_snapshots WHERE account_id=\?/);
  assert.match(adsApi, /\/reporting\/reports/);
  assert.match(adsApi, /application\/vnd\.createasyncreportrequest\.v3\+json/);
  for (const reportType of ["spCampaigns", "spTargeting", "spSearchTerm"])
    assert.match(adsApi, new RegExp(`reportTypeId: "${reportType}"`));
  assert.match(adsApi, /values: \["BROAD", "PHRASE", "EXACT"\]/);
  assert.match(adsApi, /groupBy: \["searchTerm"\]/);
  assert.match(adsApi, /Amazon-Advertising-API-Scope/);
  assert.match(adsApi, /expires_in/);
  assert.match(adsApi, /DecompressionStream\("gzip"\)/);
  assert.doesNotMatch(snapshots, /Promise\.all\(WINDOWS\.map/);
  assert.match(snapshots, /aggregateCampaignWindow/);
  assert.match(snapshots, /aggregateEntityWindow/);
  assert.match(snapshots, /REPORT_KINDS.*campaign.*keyword.*searchTerm/);
  assert.match(snapshots, /shiftDate\(cursor, 29\)/);
  assert.match(snapshots, /RAW_REPORT_RETENTION_DAYS = 30/);
  assert.match(scheduler, /runDailyReportSnapshots/);
  assert.match(snapshots, /runManualReportSnapshots/);
  assert.doesNotMatch(
    agent,
    /trySavedSnapshotQuery|tryRankedCampaignReport|tryFastAggregateReport/,
  );
  assert.match(agent, /executeReportTool/);
  assert.match(dashboard, /dashboardData/);
  assert.match(dashboard, /export async function POST/);
  assert.match(dashboardView, /广告数据看板/);
  assert.match(page, /refreshDashboard/);
  assert.match(dashboardView, /刷新每日数据/);
  assert.match(page, /analyzeDashboard/);
  assert.match(dashboardView, /高销售投放关键词/);
  assert.match(dashboardView, /高花费零订单搜索词/);
  assert.match(schema, /ad_daily_facts/);
  assert.match(schema, /ad_keyword_daily_facts/);
  assert.match(schema, /ad_search_term_daily_facts/);
  assert.match(schema, /ad_report_syncs/);
  assert.match(worker, /async scheduled/);
});
test("renders dashboard as a workspace tab and supports date-based overwrite analysis", async () => {
  const [page, view, history, anomalyRoute, anomalyService, snapshots, schema] =
    await Promise.all([
      source("app/page.tsx"),
      source("app/dashboard-view.tsx"),
      source("app/anomaly-history.tsx"),
      source("app/api/anomalies/route.ts"),
      source("lib/anomaly-analysis.ts"),
      source("lib/snapshot-reports.ts"),
      source("db/schema.ts"),
    ]);
  assert.match(page, /dashboardOpen \? "active" : ""/);
  assert.match(page, /<DashboardView/);
  assert.doesNotMatch(page, /modal dashboard-modal/);
  assert.match(view, /刷新每日数据/);
  assert.match(view, /三份近15天报表/);
  assert.match(view, /最近更新/);
  assert.match(view, /手动刷新/);
  assert.match(view, />✦ 数据分析</);
  assert.match(history, /type="date"/);
  assert.match(history, /amz-analyze-selected/);
  assert.match(anomalyRoute, /这个数据距离我们太远了，暂时无法分析/);
  assert.match(anomalyRoute, /date:analysisDate/);
  assert.match(anomalyService, /date\?: string/);
  assert.match(snapshots, /triggerType: "manual" \| "automatic"/);
  assert.match(snapshots, /REPORT_REFRESH_TIMEOUT_MS = 3 \* 60 \* 60_000/);
  assert.match(snapshots, /analysis = completed \? await runAnomalyAnalysis/);
  assert.doesNotMatch(anomalyService, /modelName: "mimo-v2\.5"/);
  assert.match(schema, /triggerType: text\("trigger_type"\)/);
});

test("provides encrypted review collection with grouped star tasks, history and CSV", async () => {
  const [
    page,
    view,
    adminUi,
    adminRoute,
    taskRoute,
    taskDetailRoute,
    downloadRoute,
    reviewApi,
    schema,
  ] = await Promise.all([
    source("app/page.tsx"),
    source("app/reviews-view.tsx"),
    source("app/model-settings-ui.tsx"),
    source("app/api/admin/review-api/route.ts"),
    source("app/api/reviews/tasks/route.ts"),
    source("app/api/reviews/tasks/[id]/route.ts"),
    source("app/api/reviews/tasks/[id]/download/route.ts"),
    source("lib/review-api.ts"),
    source("db/schema.ts"),
  ]);
  assert.match(page, /获取评论/);
  assert.match(page, /<ReviewsView/);
  for (const label of ["差评获取 1–3 星", "好评获取 4–5 星", "全部获取 1–5 星"])
    assert.match(view, new RegExp(label));
  for (const field of ["asin", "marketplace", "pages", "sortBy", "reviewerType", "mediaType"])
    assert.match(view, new RegExp(`name="${field}"`));
  assert.match(view, /下载完整 CSV/);
  assert.match(adminUi, /评论获取 API/);
  assert.match(adminRoute, /encryptJson\(\{ apiKey \}\)/);
  assert.doesNotMatch(adminRoute, /Response\.json\(\{[^}]*apiKey/);
  assert.match(taskRoute, /Promise\.allSettled/);
  assert.match(taskRoute, /expandStarMode/);
  assert.match(taskDetailRoute, /INSERT OR IGNORE INTO review_items/);
  assert.match(downloadRoute, /text\/csv; charset=utf-8/);
  assert.match(downloadRoute, /\\uFEFF/);
  assert.match(reviewApi, /"X-API-Key": apiKey/);
  assert.match(reviewApi, /if \(mode === "critical"\) return STAR_FILTERS\.slice\(0, 3\)/);
  assert.match(reviewApi, /if \(mode === "positive"\) return STAR_FILTERS\.slice\(3\)/);
  assert.match(schema, /review_api_settings/);
  assert.match(schema, /review_tasks/);
  assert.match(schema, /review_items/);
});
