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
    const normalized = key.replace(/[_-]/g, "").toLowerCase();
    const expected = kind.toLowerCase();
    if (!found && normalized === expected && ["string", "number"].includes(typeof item)) found = String(item);
    if (!found && normalized === `${expected}s` && Array.isArray(item) && ["string", "number"].includes(typeof item[0])) found = String(item[0]);
  });
  return found;
}

function containsId(value: unknown, kind: IdKind, expected: string): boolean {
  let matched = false;
  walk(value, (key, item) => {
    if (matched) return;
    const normalized = key.replace(/[_-]/g, "").toLowerCase();
    const expectedKey = kind.toLowerCase();
    if (normalized === expectedKey && ["string", "number"].includes(typeof item) && String(item) === expected) matched = true;
    if (normalized === `${expectedKey}s` && Array.isArray(item) && item.some(entry => String(entry) === expected)) matched = true;
  });
  return matched;
}

function extractWriteToolError(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try { return extractWriteToolError(JSON.parse(trimmed)); } catch { /* plain text */ }
    }
    return /\b(?:error|failed|invalid|validation|bad[_ -]?request|partialsuccess)\b/i.test(trimmed) ? trimmed.slice(0, 1200) : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const error = extractWriteToolError(item);
      if (error) return error;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const object = value as Record<string, unknown>;
  if (object.isError === true) return JSON.stringify(object.content ?? object).slice(0, 1200);
  if (object.error && (!Array.isArray(object.error) || object.error.length > 0)) return JSON.stringify(object.error).slice(0, 1200);
  for (const item of Object.values(object)) {
    const error = extractWriteToolError(item);
    if (error) return error;
  }
  return undefined;
}

export async function verifyWrite(credentials: AmazonCredentials, toolName: string, args: Record<string, unknown>, writeResult: unknown): Promise<{ tool: string; result: unknown } | null> {
  let queryTool = "", kind: IdKind = "campaignId";
  if (/campaign$/.test(toolName)) { queryTool = "campaign_management-query_campaign"; kind = "campaignId"; }
  else if (/ad_group$/.test(toolName)) { queryTool = "campaign_management-query_ad_group"; kind = "adGroupId"; }
  else if (/_(?:create|update)_ad$/.test(toolName)) { queryTool = "campaign_management-query_ad"; kind = "adId"; }
  else if (/target|delete_target/.test(toolName)) { queryTool = "campaign_management-query_target"; kind = "targetId"; }
  else return null;
  const toolError = extractWriteToolError(writeResult);
  if (toolError) throw new Error(`Amazon 写入工具返回错误: ${toolError}`);
  const id = findId([writeResult, args], kind);
  if (!id) throw new Error(`Amazon 写入响应缺少 ${kind}，无法进行强制回查`);
  const filter = kind === "campaignId" ? "campaignIdFilter" : kind === "adGroupId" ? "adGroupIdFilter" : kind === "adId" ? "adIdFilter" : "targetIdFilter";
  const body: Record<string, unknown> = { adProductFilter: { include: ["SPONSORED_PRODUCTS"] }, maxResults: 100, [filter]: { include: [id] } };
  const client = new AmazonMcpClient(credentials, modeForTool(queryTool));
  const result = await client.callTool(queryTool, { body });
  if (!containsId(result, kind, id)) {
    throw new Error(`Amazon 写入回查未找到 ${kind}=${id}；写入结果未被确认，已停止后续操作`);
  }
  return { tool: queryTool, result };
}
export async function preflightWrite(credentials: AmazonCredentials, toolName: string, args: Record<string, unknown>) {
  return verifyWrite(credentials, toolName, args, args);
}
