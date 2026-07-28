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
test("uses a compact streaming MCP agent loop with the Amazon playbook", async () => {
  const [model, agent, route, router, playbook] = await Promise.all([
    source("lib/model.ts"),
    source("lib/agent.ts"),
    source("app/api/chat/route.ts"),
    source("lib/tool-router.ts"),
    source("lib/amazon-playbook.ts"),
  ]);
  assert.match(model, /stream:\s*true/);
  assert.match(model, /compactSchema/);
  assert.doesNotMatch(model, /streamAnswer/);
  assert.match(agent, /for \(let step = 0; step < 4; step\+\+\)/);
  assert.match(agent, /messages\.push\(\{ role: "tool"/);
  assert.match(route, /planAgent\(user\.id/);
  assert.doesNotMatch(route, /finalMessages|streamAnswer/);
  assert.match(router, /selectToolsForMessage/);
  assert.match(playbook, /update_target_bid/);
  assert.match(playbook, /PENDING → COMPLETED/);
  assert.match(playbook, /ads_accounts-list_ads_accounts/);
});