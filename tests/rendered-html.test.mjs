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