import { assertSameOrigin, requireUser } from "@/lib/auth";
import { amazonAuthorizationUrl, pkceChallenge } from "@/lib/amazon-ads-oauth";
import { encryptJson, randomToken, sha256 } from "@/lib/crypto";
import { d1, ensureSchema } from "@/lib/db";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    await ensureSchema();
    const body = await request.json() as { clientId?: string; clientSecret?: string; region?: string };
    const clientId = body.clientId?.trim();
    const clientSecret = body.clientSecret?.trim();
    const region = body.region?.trim().toLowerCase();
    if (!clientId || !clientSecret) return Response.json({ error: "请填写 Client ID 和 Client Secret" }, { status: 400 });
    if (!region || !["na", "eu", "fe"].includes(region)) return Response.json({ error: "Amazon Ads 区域无效" }, { status: 400 });

    const state = randomToken(32);
    const verifier = randomToken(64);
    const redirectUri = `${new URL(request.url).origin}/api/enhanced-ads/oauth/callback`;
    const now = Date.now();
    await d1().batch([
      d1().prepare(`DELETE FROM enhanced_ads_oauth_states WHERE expires_at<?`).bind(now),
      d1().prepare(`INSERT INTO enhanced_ads_oauth_states(state_hash,user_id,encrypted_payload,redirect_uri,expires_at,created_at) VALUES(?,?,?,?,?,?)`).bind(
        await sha256(state), user.id, await encryptJson({ clientId, clientSecret, region, verifier }), redirectUri, now + 10 * 60_000, now,
      ),
    ]);
    return Response.json({
      authUrl: amazonAuthorizationUrl({ clientId, redirectUri, state, challenge: await pkceChallenge(verifier) }),
      callbackUrl: redirectUri,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "启动 Amazon OAuth 失败" }, { status: 400 });
  }
}
