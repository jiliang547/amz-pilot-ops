import assert from "node:assert/strict";
import test from "node:test";
import { expandWorkflowActions, summarizeAdsCsv } from "../lib/ads-workflow.ts";
import { selectToolsForMessage } from "../lib/tool-router.ts";

const csv = [
  "campaign.id,campaign.name,adGroup.id,adGroup.name,target.id,keyword.value,matchType.value,searchTerm.value,ad.id,advertisedProduct.id,metric.impressions,metric.clicks,metric.totalCost,metric.purchases,metric.sales",
  "100,Campaign A,1001,Group A,9001,small dog collar,BROAD,Dog Collar for Small Dogs,7001,B0FV7SPGZK,100,10,70,2,100",
  "100,Campaign A,1001,Group A,9001,small dog collar,BROAD,dog collar pink,7001,B0FV7SPGZK,80,8,20,1,50",
  "200,Campaign B,2001,Group B,9002,leather collar,EXACT,leather collar,7002,B000000000,200,20,100,1,50",
].join("\n");

test("summarizes reports by campaign, keyword, search term, ad, and product", () => {
  const summary = summarizeAdsCsv(csv, "客户搜索词 Dog Collar for Small Dogs 近7天的表现怎么样？");
  assert.equal(summary.rowCount, 3);
  assert.equal(summary.aggregates.totalCost, 190);
  assert.equal(summary.dimensions.campaign[0].label, "Campaign B");
  const exact = summary.dimensions.searchTerm.find(item => item.label === "Dog Collar for Small Dogs");
  assert.ok(exact);
  assert.equal(exact.aggregates.totalCost, 70);
  assert.equal(exact.aggregates.sales, 100);
  assert.equal(exact.metrics.acos, 70);
  assert.equal(exact.campaignId, "100");
  assert.equal(summary.dimensions.product.find(item => item.label === "B0FV7SPGZK")?.aggregates.sales, 150);
});

test("splits batch writes into one Amazon object per action", () => {
  const actions = expandWorkflowActions([
    {
      toolName: "campaign_management-update_target_bid",
      args: { body: { targets: [
        { targetId: "1", bid: { bid: 0.8 } },
        { targetId: "2", bid: { bid: 0.7 } },
      ] } },
    },
    {
      toolName: "campaign_management-delete_target",
      args: { body: { accessRequestedAccount: { profileId: "p" }, targetIds: ["3", "4"] } },
    },
  ]);
  assert.equal(actions.length, 4);
  assert.deepEqual(actions[0].args.body.targets, [{ targetId: "1", bid: { bid: 0.8 } }]);
  assert.deepEqual(actions[3].args.body.targetIds, ["4"]);
  assert.deepEqual(actions[3].args.body.accessRequestedAccount, { profileId: "p" });
});

const toolNames = [
  "ads_accounts-list_ads_accounts",
  "campaign_management-query_campaign", "campaign_management-create_campaign", "campaign_management-update_campaign",
  "campaign_management-query_ad_group", "campaign_management-create_ad_group", "campaign_management-update_ad_group",
  "campaign_management-query_ad", "campaign_management-create_ad", "campaign_management-update_ad",
  "campaign_management-query_target", "campaign_management-create_target", "campaign_management-update_target", "campaign_management-update_target_bid", "campaign_management-delete_target",
  "reporting-create_campaign_report", "reporting-create_report", "reporting-retrieve_report",
  "campaign_management-check_product_eligibility",
];
const live = toolNames.map(name => ({ name, inputSchema: {} }));

test("routes common operator questions to all tools needed for the full workflow", () => {
  const cases = [
    ["查询投放词 dog collar 近7天的表现", ["campaign_management-query_target", "reporting-create_report", "reporting-retrieve_report"]],
    ["客户搜索词 Dog Collar for Small Dogs 近7天表现怎么样", ["campaign_management-query_target", "reporting-create_report"]],
    ["查询广告活动 Campaign A 的状态和预算", ["campaign_management-query_campaign"]],
    ["将近7天花费最多的广告活动出价方式调整为仅降低", ["reporting-create_campaign_report", "campaign_management-query_campaign", "campaign_management-update_campaign"]],
    ["暂停 ASIN B0FV7SPGZK 对应的商品广告", ["campaign_management-query_ad", "campaign_management-update_ad"]],
    ["为 ASIN B0FV7SPGZK 新建商品广告前检查资格", ["campaign_management-query_ad", "campaign_management-check_product_eligibility"]],
    ["把 ACOS 大于70%的关键词出价降低20%", ["reporting-create_report", "campaign_management-query_target", "campaign_management-update_target_bid"]],
  ];
  for (const [question, expected] of cases) {
    const selected = new Set(selectToolsForMessage(question, live).map(tool => tool.name));
    for (const tool of expected) assert.ok(selected.has(tool), `${question} should include ${tool}`);
  }
});
