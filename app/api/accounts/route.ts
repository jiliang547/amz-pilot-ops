import { assertSameOrigin, requireUser } from "@/lib/auth";
import { bootstrapAccount } from "@/lib/accounts";
import { discoverAccountMetadata } from "@/lib/account-context";
import { d1 } from "@/lib/db";
import { encryptJson } from "@/lib/crypto";
import { AmazonMcpClient, type AmazonCredentials } from "@/lib/amazon-mcp";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    await bootstrapAccount(user);
    const rows = await d1().prepare(`SELECT id,name,region,marketplace,timezone,currency,profile_id profileId,advertiser_account_id advertiserAccountId,created_at createdAt FROM accounts WHERE user_id=? ORDER BY created_at`).bind(user.id).all();
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
    const body = await request.json() as Partial<AmazonCredentials> & { marketplace?: string };
    for (const key of ["clientId", "clientSecret", "refreshToken", "profileId", "region"] as const) {
      if (!body[key]?.trim()) return Response.json({ error: `缺少 ${key}` }, { status: 400 });
    }
    const credentials: AmazonCredentials = {
      clientId: body.clientId!.trim(), clientSecret: body.clientSecret!.trim(), refreshToken: body.refreshToken!.trim(),
      profileId: body.profileId!.trim(), region: body.region!.trim().toLowerCase(),
    };
    if (!["na", "eu", "fe"].includes(credentials.region)) return Response.json({ error: "Amazon Ads 区域无效" }, { status: 400 });
    const fallbackMarketplace = body.marketplace?.trim().toUpperCase();
    if (fallbackMarketplace && !/^[A-Z]{2}$/.test(fallbackMarketplace)) return Response.json({ error: "Amazon 站点应为两位国家代码，例如 US" }, { status: 400 });

    const client = new AmazonMcpClient(credentials, "FIXED");
    const tools = await client.listTools();
    if (!tools.some(tool => tool.name === "ads_accounts-list_ads_accounts")) throw new Error("Amazon MCP 未返回账户查询工具");
    let metadata: ReturnType<typeof discoverAccountMetadata> = {};
    try { metadata = discoverAccountMetadata(await client.callTool("ads_accounts-list_ads_accounts", { body: { maxResults: 100 } }), credentials.profileId); } catch { /* Marketplace fallback remains available. */ }
    credentials.advertiserAccountId = metadata.advertiserAccountId;

    const now = Date.now(), proposedId = crypto.randomUUID();
    const name = (metadata.name || `Amazon ${credentials.region.toUpperCase()} · ${credentials.profileId.slice(-6)}`).slice(0, 80);
    const marketplace = metadata.marketplace || fallbackMarketplace || null;
    await d1().prepare(`INSERT INTO accounts(id,user_id,name,region,marketplace,timezone,currency,profile_id,advertiser_account_id,encrypted_credentials,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,profile_id) DO UPDATE SET name=excluded.name,region=excluded.region,marketplace=excluded.marketplace,timezone=excluded.timezone,currency=excluded.currency,advertiser_account_id=excluded.advertiser_account_id,encrypted_credentials=excluded.encrypted_credentials,updated_at=excluded.updated_at`).bind(proposedId, user.id, name, credentials.region, marketplace, metadata.timezone ?? null, metadata.currency ?? null, credentials.profileId, credentials.advertiserAccountId ?? null, await encryptJson(credentials), now, now).run();
    const saved = await d1().prepare(`SELECT id,name,marketplace,timezone,currency,advertiser_account_id advertiserAccountId FROM accounts WHERE user_id=? AND profile_id=?`).bind(user.id, credentials.profileId).first();
    await d1().prepare(`INSERT INTO audit_logs(id,user_id,account_id,action,target,detail,outcome,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), user.id, (saved as { id?: string } | null)?.id || proposedId, "account.connect", credentials.profileId, `MCP handshake succeeded; marketplace=${marketplace ?? "unknown"}`, "success", now).run();
    return Response.json({ ok: true, account: saved, advertiserAccountDiscovered: Boolean(credentials.advertiserAccountId), marketplaceDiscovered: Boolean(metadata.marketplace) }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "连接失败" }, { status: 400 });
  }
}
