import type { McpTool } from "./amazon-mcp";

const GROUPS = {
  account: ["ads_accounts-list_ads_accounts"],
  campaign: ["campaign_management-query_campaign", "campaign_management-create_campaign", "campaign_management-update_campaign"],
  adGroup: ["campaign_management-query_ad_group", "campaign_management-create_ad_group", "campaign_management-update_ad_group"],
  ad: ["campaign_management-query_ad", "campaign_management-create_ad", "campaign_management-update_ad"],
  target: ["campaign_management-query_target", "campaign_management-create_target", "campaign_management-update_target", "campaign_management-update_target_bid", "campaign_management-delete_target"],
  report: ["reporting-create_campaign_report", "reporting-create_report", "reporting-retrieve_report"],
} as const;

function add(selected: Set<string>, names: readonly string[]) {
  for (const name of names) selected.add(name);
}

export function selectToolsForMessage(message: string, liveTools: McpTool[]): McpTool[] {
  const text = message.toLowerCase();
  const selected = new Set<string>();
  const wantsReport = /报表|报告|日报|acos|roas|ctr|转化率|点击率|花费|销售额|搜索词|表现|数据|趋势|排名|排行|最高|最低|top|report/i.test(text);
  const wantsCampaign = /campaign|广告活动|活动|预算|placement|竞价策略/i.test(text);
  const wantsAdGroup = /ad\s*group|广告组/i.test(text);
  const wantsAd = /product\s*ad|商品广告|广告商品|\basin\b|\bsku\b|ad\s*id/i.test(text);
  const wantsTarget = /target|keyword|关键词|投放词|搜索词|否定词|匹配方式|\bbid\b|出价/i.test(text);
  const wantsAccount = /账户|账号|店铺|profile|advertiser|account/i.test(text);

  if (wantsAccount) add(selected, GROUPS.account);
  if (wantsCampaign) add(selected, GROUPS.campaign);
  if (wantsAdGroup) add(selected, GROUPS.adGroup);
  if (wantsAd) add(selected, GROUPS.ad);
  if (wantsAd && /创建|新建|添加|资格|eligible|eligibility/i.test(text)) add(selected, liveTools.filter(tool => /product.*eligib|eligib.*product/i.test(tool.name)).map(tool => tool.name));
  if (wantsTarget) add(selected, GROUPS.target);
  if (wantsReport) {
    add(selected, GROUPS.report);
    add(selected, ["campaign_management-query_campaign"]);
    if (wantsTarget) add(selected, ["campaign_management-query_target"]);
  }
  if (!selected.size) {
    add(selected, ["campaign_management-query_campaign", "campaign_management-query_ad_group", "campaign_management-query_ad", "campaign_management-query_target"]);
  }
  return liveTools.filter(tool => selected.has(tool.name));
}