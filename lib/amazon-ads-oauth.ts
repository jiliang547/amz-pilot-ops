import { discoverAccountMetadata } from "./account-context";
import { encryptJson } from "./crypto";
import { d1 } from "./db";
import { AmazonMcpClient, type AmazonCredentials } from "./amazon-mcp";

export const AMAZON_ADS_SCOPE = "advertising::campaign_management";
export const LWA_AUTHORIZE_URL = "https://lwa.amazon.com/ap/oa";
export const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";

type AdsProfile = {
  profileId: string | number;
  countryCode?: string;
  currencyCode?: string;
  timezone?: string;
  accountInfo?: { id?: string; name?: string; type?: string };
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
};

const API_BASE: Record<string, string> = {
  na: "https://advertising-api.amazon.com",
  eu: "https://advertising-api-eu.amazon.com",
  fe: "https://advertising-api-fe.amazon.com",
};

export async function pkceChallenge(verifier: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function amazonAuthorizationUrl(input: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const url = new URL(LWA_AUTHORIZE_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("scope", AMAZON_ADS_SCOPE);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeAuthorizationCode(input: { clientId: string; clientSecret: string; code: string; redirectUri: string; verifier: string }): Promise<Required<Pick<TokenResponse, "access_token" | "refresh_token">> & TokenResponse> {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code_verifier: input.verifier,
  });
  const response = await fetch(LWA_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  const data = await response.json().catch(() => ({})) as TokenResponse;
  if (!response.ok || !data.access_token) throw new Error(`Amazon OAuth 换取令牌失败 (${response.status})：${data.error_description || data.error || "未返回 access token"}`);
  if (!data.refresh_token) throw new Error("Amazon OAuth 未返回 refresh token；请确认使用 Private Client 并重新授权");
  return data as Required<Pick<TokenResponse, "access_token" | "refresh_token">> & TokenResponse;
}

async function listProfiles(region: string, clientId: string, accessToken: string): Promise<AdsProfile[]> {
  const base = API_BASE[region];
  if (!base) throw new Error("Amazon Ads 区域无效");
  const response = await fetch(`${base}/v2/profiles`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Amazon-Advertising-API-ClientId": clientId,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Amazon Ads 店铺发现失败 (${response.status})：${text.slice(0, 300)}`);
  const profiles = JSON.parse(text) as AdsProfile[];
  if (!Array.isArray(profiles) || !profiles.length) throw new Error("Amazon OAuth 授权成功，但没有发现可访问的广告店铺");
  return profiles;
}

export async function saveOAuthAccounts(input: { userId: string; clientId: string; clientSecret: string; refreshToken: string; accessToken: string; region: string }): Promise<{ count: number; accountIds: string[] }> {
  const profiles = await listProfiles(input.region, input.clientId, input.accessToken);
  const now = Date.now();
  const accountIds: string[] = [];
  for (const profile of profiles.slice(0, 100)) {
    const profileId = String(profile.profileId || "").trim();
    if (!profileId) continue;
    const credentials: AmazonCredentials = {
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      refreshToken: input.refreshToken,
      profileId,
      region: input.region,
    };
    let metadata = {
      advertiserAccountId: undefined as string | undefined,
      name: profile.accountInfo?.name,
      marketplace: profile.countryCode?.toUpperCase(),
      timezone: profile.timezone,
      currency: profile.currencyCode?.toUpperCase(),
    };
    try {
      const client = new AmazonMcpClient(credentials, "FIXED");
      const tools = await client.listTools();
      if (!tools.some(tool => tool.name === "ads_accounts-list_ads_accounts")) throw new Error("Amazon MCP 未返回账户查询工具");
      const discovered = discoverAccountMetadata(await client.callTool("ads_accounts-list_ads_accounts", { body: { maxResults: 100 } }), profileId);
      metadata = { ...metadata, ...Object.fromEntries(Object.entries(discovered).filter(([, value]) => value != null)) };
    } catch {
      // The authorized profile itself is sufficient to save the account. MCP
      // metadata can be discovered again when the Agent first uses it.
    }
    credentials.advertiserAccountId = metadata.advertiserAccountId;
    const proposedId = crypto.randomUUID();
    const name = (metadata.name || `Amazon ${input.region.toUpperCase()} · ${profileId.slice(-6)}`).slice(0, 80);
    await d1().prepare(`INSERT INTO accounts(id,user_id,name,region,marketplace,timezone,currency,profile_id,advertiser_account_id,encrypted_credentials,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,profile_id) DO UPDATE SET name=excluded.name,region=excluded.region,marketplace=excluded.marketplace,timezone=excluded.timezone,currency=excluded.currency,advertiser_account_id=excluded.advertiser_account_id,encrypted_credentials=excluded.encrypted_credentials,updated_at=excluded.updated_at`).bind(
      proposedId, input.userId, name, input.region, metadata.marketplace || null, metadata.timezone || null, metadata.currency || null, profileId, metadata.advertiserAccountId || null, await encryptJson(credentials), now, now,
    ).run();
    const saved = await d1().prepare(`SELECT id FROM accounts WHERE user_id=? AND profile_id=?`).bind(input.userId, profileId).first<{ id: string }>();
    if (saved?.id) accountIds.push(saved.id);
  }
  if (!accountIds.length) throw new Error("Amazon OAuth 授权完成，但没有可保存的广告 Profile");
  return { count: accountIds.length, accountIds };
}
