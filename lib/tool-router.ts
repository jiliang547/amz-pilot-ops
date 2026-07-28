import type { McpTool } from "./amazon-mcp";

const ACCOUNT = ["ads_accounts-list_ads_accounts"];
const CAMPAIGN = ["campaign_management-query_campaign", "campaign_management-create_campaign", "campaign_management-update_campaign"];
const AD_GROUP = ["campaign_management-query_ad_group", "campaign_management-create_ad_group", "campaign_management-update_ad_group"];
const AD = ["campaign_management-query_ad", "campaign_management-create_ad", "campaign_management-update_ad"];
const TARGET = ["campaign_management-query_target", "campaign_management-create_target", "campaign_management-update_target", "campaign_management-update_target_bid", "campaign_management-delete_target"];
const REPORT = ["reporting-create_campaign_report", "reporting-create_report", "reporting-retrieve_report"];

function has(text: string, pattern: RegExp): boolean { return pattern.test(text); }
function add(target: Set<string>, names: string[]): void { for (const name of names) target.add(name); }

export function selectToolsForMessage(message: string, liveTools: McpTool[]): McpTool[] {
  const text = message.toLowerCase();
  const selected = new Set<string>();
  const account = has(text, /账户|账号|店铺|profile|advertiser|entity/);
  const campaign = has(text, /campaign|广告活动|活动预算|placement|预算|竞价策略/);
  const adGroup = has(text, /ad\s*group|广告组/);
  const ad = has(text, /product\s*ad|商品广告|广告商品|\basin\b|\bsku\b|ad\s*id/);
  const target = has(text, /target|keyword|关键词|搜索词|否定词|匹配方式|\bbid\b|出价/);
  const report = has(text, /report|报表|日报|acos|roas|ctr|转化率|点击率|花费|销售额|近\s*\d+\s*天|最近\s*\d+\s*天/);
  const fullCreate = has(text, /创建|新建|搭建|create/) && has(text, /sponsored\s*products?|sp\s*广告|广告活动|campaign/);

  if (account) add(selected, ACCOUNT);
  if (campaign) add(selected, CAMPAIGN);
  if (adGroup) add(selected, AD_GROUP);
  if (ad) add(selected, AD);
  if (target) add(selected, TARGET);
  if (report) { add(selected, REPORT); add(selected, ACCOUNT); add(selected, [CAMPAIGN[0]]); }
  if (fullCreate) { add(selected, CAMPAIGN); add(selected, AD_GROUP); add(selected, AD); add(selected, TARGET); }

  if (!selected.size) {
    add(selected, [CAMPAIGN[0], AD_GROUP[0], AD[0], TARGET[0]]);
  } else if (has(text, /查询|查看|检查|分析|优化|暂停|修改|更新|归档|删除/)) {
    if (campaign) selected.add(CAMPAIGN[0]);
    if (adGroup) selected.add(AD_GROUP[0]);
    if (ad) selected.add(AD[0]);
    if (target) selected.add(TARGET[0]);
  }

  return liveTools.filter(tool => selected.has(tool.name));
}