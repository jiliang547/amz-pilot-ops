import { requireUser } from "@/lib/auth";
import { exchangeAuthorizationCode, saveOAuthAccounts } from "@/lib/amazon-ads-oauth";
import { decryptJson, sha256 } from "@/lib/crypto";
import { d1, ensureSchema } from "@/lib/db";

type OAuthState = { clientId: string; clientSecret: string; region: string; verifier: string };

function finish(request: Request, status: "success" | "error", detail: string) {
  const url = new URL("/", new URL(request.url).origin);
  url.searchParams.set("enhancedAdsOauth", status);
  url.searchParams.set(status === "success" ? "accounts" : "message", detail.slice(0, 300));
  return Response.redirect(url.toString(), 302);
}

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    await ensureSchema();
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");
    if (oauthError) return finish(request, "error", oauthError);
    if (!state || !code) return finish(request, "error", "Amazon OAuth 回调缺少 state 或 code");

    const row = await d1().prepare(`SELECT encrypted_payload encryptedPayload,redirect_uri redirectUri,expires_at expiresAt FROM enhanced_ads_oauth_states WHERE state_hash=? AND user_id=?`).bind(await sha256(state), user.id).first<{ encryptedPayload: string; redirectUri: string; expiresAt: number }>();
    if (!row || row.expiresAt < Date.now()) return finish(request, "error", "授权请求已失效，请重新发起");
    await d1().prepare(`DELETE FROM enhanced_ads_oauth_states WHERE state_hash=?`).bind(await sha256(state)).run();

    const pending = await decryptJson<OAuthState>(row.encryptedPayload);
    const token = await exchangeAuthorizationCode({ clientId: pending.clientId, clientSecret: pending.clientSecret, code, redirectUri: row.redirectUri, verifier: pending.verifier });
    const saved = await saveOAuthAccounts({ userId: user.id, clientId: pending.clientId, clientSecret: pending.clientSecret, refreshToken: token.refresh_token, accessToken: token.access_token, region: pending.region });
    await d1().prepare(`INSERT INTO audit_logs(id,user_id,account_id,action,target,detail,outcome,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(
      crypto.randomUUID(), user.id, saved.accountIds[0] || null, "enhanced_ads.oauth.connect", saved.accountIds.join(","), `OAuth 2.1 connected ${saved.count} Amazon Ads profile(s)`, "success", Date.now(),
    ).run();
    return finish(request, "success", String(saved.count));
  } catch (error) {
    if (error instanceof Response) return error;
    return finish(request, "error", error instanceof Error ? error.message : "Amazon OAuth 授权失败");
  }
}
