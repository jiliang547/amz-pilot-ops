import { assertSameOrigin, requireUser } from "@/lib/auth";
import { bootstrapAccount } from "@/lib/accounts";
import { d1 } from "@/lib/db";
import { encryptJson } from "@/lib/crypto";
import { AmazonMcpClient, type AmazonCredentials } from "@/lib/amazon-mcp";

function visit(value: unknown, objects: Record<string, unknown>[]): void {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try { visit(JSON.parse(trimmed), objects); } catch {}
    }
    return;
  }
  if (Array.isArray(value)) { for (const item of value) visit(item, objects); return; }
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  objects.push(object);
  for (const item of Object.values(object)) visit(item, objects);
}

function findString(value: unknown, matcher: (key: string, value: string) => boolean): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) { const found = findString(item, matcher); if (found) return found; }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string" && matcher(key.toLowerCase(), item)) return item;
    const found = findString(item, matcher);
    if (found) return found;
  }
  return undefined;
}

function accountMetadata(result: unknown, profileId: string): { advertiserAccountId?: string; name?: string } {
  const objects: Record<string, unknown>[] = [];
  visit(result, objects);
  const matching = objects.filter(object => {
    try { return JSON.stringify(object).includes(profileId); } catch { return false; }
  });
  const candidates = matching.length ? matching : objects;
  for (const candidate of candidates) {
    const advertiserAccountId = findString(candidate, (key, value) => key === "advertiseraccountid" || value.startsWith("amzn1.ads-account."));
    if (!advertiserAccountId) continue;
    const name = findString(candidate, (key, value) => ["name", "accountname", "advertisername"].includes(key) && value.length <= 100);
    return { advertiserAccountId, name };
  }
  return {};
}

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    await bootstrapAccount(user);
    const rows = await d1().prepare(`SELECT id,name,region,profile_id profileId,advertiser_account_id advertiserAccountId,created_at createdAt FROM accounts WHERE user_id=? ORDER BY created_at`).bind(user.id).all();
    return Response.json({ accounts: rows.results });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "读取账号失败" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = await request.json() as Partial<AmazonCredentials>;
    for (const key of ["clientId", "clientSecret", "refreshToken", "profileId", "region"] as const) {
      if (!body[key]?.trim()) return Response.json({ error: `缺少 ${key}` }, { status: 400 });
    }
    const credentials: AmazonCredentials = {
      clientId: body.clientId!.trim(),
      clientSecret: body.clientSecret!.trim(),
      refreshToken: body.refreshToken!.trim(),
      profileId: body.profileId!.trim(),
      region: body.region!.trim().toLowerCase(),
    };
    if (!['na', 'eu', 'fe'].includes(credentials.region)) return Response.json({ error: "Amazon Ads 区域无效" }, { status: 400 });

    const client = new AmazonMcpClient(credentials, "FIXED");
    const tools = await client.listTools();
    if (!tools.some(tool => tool.name === "ads_accounts-list_ads_accounts")) throw new Error("Amazon MCP 未返回账户查询工具");
    let metadata: { advertiserAccountId?: string; name?: string } = {};
    try {
      metadata = accountMetadata(await client.callTool("ads_accounts-list_ads_accounts", { body: { maxResults: 100 } }), credentials.profileId);
    } catch {}
    credentials.advertiserAccountId = metadata.advertiserAccountId;

    const now = Date.now(), proposedId = crypto.randomUUID();
    const name = (metadata.name || `Amazon ${credentials.region.toUpperCase()} · ${credentials.profileId.slice(-6)}`).slice(0, 80);
    await d1().prepare(`INSERT INTO accounts(id,user_id,name,region,profile_id,advertiser_account_id,encrypted_credentials,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,profile_id) DO UPDATE SET name=excluded.name,region=excluded.region,advertiser_account_id=excluded.advertiser_account_id,encrypted_credentials=excluded.encrypted_credentials,updated_at=excluded.updated_at`).bind(proposedId, user.id, name, credentials.region, credentials.profileId, credentials.advertiserAccountId ?? null, await encryptJson(credentials), now, now).run();
    const saved = await d1().prepare(`SELECT id,name,advertiser_account_id advertiserAccountId FROM accounts WHERE user_id=? AND profile_id=?`).bind(user.id, credentials.profileId).first<{ id: string; name: string; advertiserAccountId: string | null }>();
    await d1().prepare(`INSERT INTO audit_logs(id,user_id,account_id,action,target,detail,outcome,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), user.id, saved?.id || proposedId, "account.connect", credentials.profileId, credentials.advertiserAccountId ? "MCP handshake succeeded; advertiser account auto-discovered" : "MCP handshake succeeded", "success", now).run();
    return Response.json({ ok: true, account: saved, advertiserAccountDiscovered: Boolean(credentials.advertiserAccountId) }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "连接失败" }, { status: 400 });
  }
}