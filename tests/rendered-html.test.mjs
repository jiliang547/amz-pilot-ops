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
    source("lib/report-result.ts"),
  ]);
  assert.match(model, /stream:\s*true/);
  assert.doesNotMatch(model, /compactSchema|streamAnswer/);
  assert.match(model, /parameters: tool\.inputSchema/);
  assert.match(agent, /while \(true\)/);
  assert.doesNotMatch(agent, /step < 4|slice\(0, 3\)|selectToolsForMessage/);
  assert.match(agent, /messages\.push\(\{ role: "tool"/);
  assert.match(agent, /reportIsPending/);
  assert.match(agent, /enrichReportResult/);
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