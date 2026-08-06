import assert from "node:assert/strict";
import test from "node:test";
import {
  ADS_CAPABILITY_TOOL_NAME,
  capabilityCatalog,
  capabilityForToolName,
  initialAdsTools,
  mergeTools,
  toolsForCapabilities,
} from "../lib/ads-tool-catalog.ts";

const names = [
  "ads_accounts-list_ads_accounts",
  "ads_accounts-get_ads_account",
  "campaign_management-query_campaign",
  "campaign_management-query_portfolio",
  "campaign_management-query_ad_group",
  "campaign_management-query_ad",
  "campaign_management-query_target",
  "campaign_management-update_target_bid",
  "reporting-create_report",
  "reporting-retrieve_report",
  "campaign_management-check_product_eligibility",
  "billing-list_invoices",
  "amc-execute_query",
  "amazon_live-list_broadcasts",
  "users-list_users",
];
const live = names.map(name => ({ name, description: name, inputSchema: { type: "object" } }));

test("starts with a small stable Amazon Ads catalog", () => {
  const initial = initialAdsTools(live).map(tool => tool.name);
  assert.deepEqual(initial, names.slice(0, 4));
  assert.ok(initial.length < live.length);
});

test("loads reporting and targeting schemas by model-selected capability", () => {
  const selected = toolsForCapabilities(live, ["reporting", "targeting"]).map(tool => tool.name);
  assert.deepEqual(selected, [
    "campaign_management-query_target",
    "campaign_management-update_target_bid",
    "reporting-create_report",
    "reporting-retrieve_report",
  ]);
  assert.equal(capabilityForToolName("campaign_management-query_ad"), "ads");
  assert.equal(capabilityForToolName("campaign_management-check_product_eligibility"), "eligibility");
});

test("capability catalog covers every live tool without duplicating schemas", () => {
  const catalog = capabilityCatalog(live);
  const catalogNames = catalog.flatMap(group => group.toolNames);
  assert.deepEqual(new Set(catalogNames), new Set(names));
  assert.equal(catalogNames.length, names.length);
  assert.equal(ADS_CAPABILITY_TOOL_NAME, "amazon_ads-load_capabilities");
});

test("merges newly loaded capabilities without duplicate tools", () => {
  const initial = initialAdsTools(live);
  const expanded = mergeTools(initial, toolsForCapabilities(live, ["campaigns", "reporting"]));
  assert.equal(expanded.filter(tool => tool.name === "campaign_management-query_campaign").length, 1);
  assert.ok(expanded.some(tool => tool.name === "reporting-create_report"));
});
