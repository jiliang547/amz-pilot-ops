import type { McpTool } from "./amazon-mcp";

export const ADS_CAPABILITY_TOOL_NAME = "amazon_ads-load_capabilities";

export const ADS_CAPABILITIES = [
  "accounts",
  "campaigns",
  "ads",
  "targeting",
  "reporting",
  "eligibility",
  "billing",
  "amc",
  "live",
  "promotions",
  "administration",
] as const;

export type AdsCapability = (typeof ADS_CAPABILITIES)[number];

export const ADS_CAPABILITY_DESCRIPTIONS: Record<AdsCapability, string> = {
  accounts: "Advertiser/profile/manager account discovery and account settings.",
  campaigns: "Campaigns, portfolios, budgets, states, bidding strategies, locale expansion and campaign-level operations.",
  ads: "Ad groups, product ads, ad associations and their create/query/update/delete operations.",
  targeting: "Keywords, product targets, bids, negative targets and targeting queries/updates.",
  reporting: "Create, poll, retrieve and delete Amazon Ads reports, including campaign, search-term, product and inventory reports.",
  eligibility: "Product and advertiser product-group eligibility checks required before creating ads.",
  billing: "Invoices, billing profiles and billing notifications.",
  amc: "Amazon Marketing Cloud data sources, queries, workflows and workflow executions.",
  live: "Amazon Live channels, broadcasts, media assets, carousel items and promo codes.",
  promotions: "Promotion offers, rewards and promotion code redemption.",
  administration: "Users, roles, permissions, invitations, terms tokens and test-account administration.",
};

export const adsCapabilityTool: McpTool = {
  name: ADS_CAPABILITY_TOOL_NAME,
  description: [
    "Load one or more Amazon Ads MCP capability groups into the model's tool catalog for subsequent rounds.",
    "Use this before requesting a tool that is not currently visible.",
    ...ADS_CAPABILITIES.map(name => `${name}: ${ADS_CAPABILITY_DESCRIPTIONS[name]}`),
  ].join("\n"),
  inputSchema: {
    type: "object",
    properties: {
      capabilities: {
        type: "array",
        minItems: 1,
        uniqueItems: true,
        items: { type: "string", enum: [...ADS_CAPABILITIES] },
        description: "Business capability groups needed for the current task or Skill stage.",
      },
    },
    required: ["capabilities"],
    additionalProperties: false,
  },
};

export function capabilityForToolName(name: string): AdsCapability {
  if (name.startsWith("reporting-")) return "reporting";
  if (name.startsWith("ads_accounts-") || name.startsWith("account_management-") || name.startsWith("manager_accounts-")) return "accounts";
  if (name.startsWith("billing-")) return "billing";
  if (name.startsWith("amc-")) return "amc";
  if (name.startsWith("amazon_live-")) return "live";
  if (name.startsWith("promotions-")) return "promotions";
  if (name.startsWith("eligibility-") || name.startsWith("advertiser_product_group_eligibility-") || name.includes("product_eligibility")) return "eligibility";
  if (name.startsWith("campaign_management-")) {
    if (/(?:^|[-_])target(?:[-_]|$)|target_bid/i.test(name)) return "targeting";
    if (/ad_group|ad_association|(?:^|[-_])(query|create|update|delete)_ad(?:[-_]|$)/i.test(name)) return "ads";
    return "campaigns";
  }
  return "administration";
}

export function toolsForCapabilities(live: McpTool[], capabilities: Iterable<AdsCapability>): McpTool[] {
  const enabled = new Set(capabilities);
  return live.filter(tool => enabled.has(capabilityForToolName(tool.name)));
}

export function initialAdsTools(live: McpTool[]): McpTool[] {
  const bootstrap = new Set([
    "ads_accounts-list_ads_accounts",
    "ads_accounts-get_ads_account",
    "campaign_management-query_campaign",
    "campaign_management-query_portfolio",
  ]);
  return live.filter(tool => bootstrap.has(tool.name));
}

export function mergeTools(current: McpTool[], additions: McpTool[]): McpTool[] {
  const byName = new Map(current.map(tool => [tool.name, tool]));
  for (const tool of additions) byName.set(tool.name, tool);
  return [...byName.values()];
}

export function capabilityCatalog(live: McpTool[]) {
  return ADS_CAPABILITIES.map(name => ({
    name,
    description: ADS_CAPABILITY_DESCRIPTIONS[name],
    toolCount: live.filter(tool => capabilityForToolName(tool.name) === name).length,
    toolNames: live.filter(tool => capabilityForToolName(tool.name) === name).map(tool => tool.name),
  }));
}
