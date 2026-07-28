import type { AmazonCredentials } from "./amazon-mcp";
import { AmazonMcpClient, modeForTool } from "./amazon-mcp";

type IdKind = "campaignId" | "adGroupId" | "adId" | "targetId";

function walk(value: unknown, visit: (key: string, value: unknown) => void): void {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) { try { walk(JSON.parse(trimmed), visit); } catch { /* text response */ } }
    return;
  }
  if (Array.isArray(value)) { for (const item of value) walk(item, visit); return; }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) { visit(key, item); walk(item, visit); }
}

function findId(values: unknown[], kind: IdKind): string | undefined {
  let found: string | undefined;
  for (const value of values) walk(value, (key, item) => {
    if (!found && key.toLowerCase() === kind.toLowerCase() && ["string", "number"].includes(typeof item)) found = String(item);
  });
  return found;
}

export async function verifyWrite(credentials: AmazonCredentials, toolName: string, args: Record<string, unknown>, writeResult: unknown): Promise<{ tool: string; result: unknown } | null> {
  let queryTool = "", kind: IdKind = "campaignId";
  if (/campaign$/.test(toolName)) { queryTool = "campaign_management-query_campaign"; kind = "campaignId"; }
  else if (/ad_group$/.test(toolName)) { queryTool = "campaign_management-query_ad_group"; kind = "adGroupId"; }
  else if (/_(?:create|update)_ad$/.test(toolName)) { queryTool = "campaign_management-query_ad"; kind = "adId"; }
  else if (/target|delete_target/.test(toolName)) { queryTool = "campaign_management-query_target"; kind = "targetId"; }
  else return null;
  const id = findId([writeResult, args], kind);
  if (!id) return null;
  const filter = kind === "campaignId" ? "campaignIdFilter" : kind === "adGroupId" ? "adGroupIdFilter" : kind === "adId" ? "adIdFilter" : "targetIdFilter";
  const body: Record<string, unknown> = { adProductFilter: { include: ["SPONSORED_PRODUCTS"] }, maxResults: 100, [filter]: { include: [id] } };
  const client = new AmazonMcpClient(credentials, modeForTool(queryTool));
  return { tool: queryTool, result: await client.callTool(queryTool, { body }) };
}