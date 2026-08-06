import { assertSameOrigin, requireUser } from "@/lib/auth";
import { encryptJson } from "@/lib/crypto";
import { d1, ensureSchema } from "@/lib/db";
import { testSpApiCredentials, type SpApiCredentials } from "@/lib/sp-api";

export async function GET(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    await ensureSchema();
    const row = await d1().prepare(
      `SELECT region,marketplace_id,marketplace_name,country_code,seller_id,updated_at FROM sp_api_settings WHERE user_id=?`,
    ).bind(user.id).first<{ region: string; marketplace_id: string; marketplace_name: string; country_code: string; seller_id: string | null; updated_at: number }>();
    return Response.json(row ? {
      configured: true,
      region: row.region,
      marketplaceId: row.marketplace_id,
      marketplaceName: row.marketplace_name,
      countryCode: row.country_code,
      sellerId: row.seller_id ?? "",
      updatedAt: row.updated_at,
    } : { configured: false });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "读取 SP-API 配置失败" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = await request.json() as Partial<SpApiCredentials> & { sellerId?: string };
    const credentials = {
      clientId: body.clientId?.trim() ?? "",
      clientSecret: body.clientSecret?.trim() ?? "",
      refreshToken: body.refreshToken?.trim() ?? "",
    };
    if (!credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) {
      return Response.json({ error: "请完整填写 SP_API_CLIENT_ID、SP_API_CLIENT_SECRET 和 SP_API_REFRESH_TOKEN" }, { status: 400 });
    }
    const sellerId = typeof body.sellerId === "string" ? body.sellerId.trim() : undefined;
    if (sellerId && !/^[A-Za-z0-9_-]{3,80}$/.test(sellerId)) {
      return Response.json({ error: "Seller ID 格式不正确，请填写 Amazon Seller/Merchant ID；如暂时不用可留空" }, { status: 400 });
    }
    const connection = await testSpApiCredentials(credentials);
    const now = Date.now();
    await ensureSchema();
    const existing = await d1().prepare(`SELECT seller_id FROM sp_api_settings WHERE user_id=?`).bind(user.id).first<{ seller_id: string | null }>();
    const effectiveSellerId = sellerId ?? existing?.seller_id ?? null;
    await d1().prepare(
      `INSERT INTO sp_api_settings(user_id,encrypted_credentials,region,marketplace_id,marketplace_name,country_code,seller_id,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET encrypted_credentials=excluded.encrypted_credentials,region=excluded.region,marketplace_id=excluded.marketplace_id,marketplace_name=excluded.marketplace_name,country_code=excluded.country_code,seller_id=excluded.seller_id,updated_at=excluded.updated_at`,
    ).bind(user.id, await encryptJson(credentials), connection.region, connection.marketplaceId, connection.marketplaceName, connection.countryCode, effectiveSellerId, now, now).run();
    return Response.json({ ok: true, configured: true, ...connection, sellerId: effectiveSellerId ?? "" });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "连接 SP-API 失败" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    await d1().prepare(`DELETE FROM sp_api_settings WHERE user_id=?`).bind(user.id).run();
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "断开 SP-API 失败" }, { status: 400 });
  }
}
