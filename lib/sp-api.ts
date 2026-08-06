import { decryptJson } from "./crypto";
import { d1, ensureSchema } from "./db";
import { SP_API_ENDPOINTS, type SpApiEndpoint } from "./sp-api-catalog.generated";

export type SpApiCredentials = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

export type SpApiConnection = {
  credentials: SpApiCredentials;
  region: "NA" | "EU" | "FE";
  marketplaceId: string;
  marketplaceName: string;
  countryCode: string;
  sellerId?: string;
};

const REGION_HOSTS = {
  NA: "https://sellingpartnerapi-na.amazon.com",
  EU: "https://sellingpartnerapi-eu.amazon.com",
  FE: "https://sellingpartnerapi-fe.amazon.com",
} as const;

export async function loadSpApiConnection(userId: string): Promise<SpApiConnection> {
  await ensureSchema();
  const row = await d1().prepare(
    `SELECT encrypted_credentials,region,marketplace_id,marketplace_name,country_code,seller_id FROM sp_api_settings WHERE user_id=?`,
  ).bind(userId).first<{
    encrypted_credentials: string;
    region: "NA" | "EU" | "FE";
    marketplace_id: string;
    marketplace_name: string;
    country_code: string;
    seller_id: string | null;
  }>();
  if (!row) throw new Error("请先配置并连接 Amazon SP-API");
  return {
    credentials: await decryptJson<SpApiCredentials>(row.encrypted_credentials),
    region: row.region,
    marketplaceId: row.marketplace_id,
    marketplaceName: row.marketplace_name,
    countryCode: row.country_code,
    sellerId: row.seller_id ?? undefined,
  };
}

export class SpApiClient {
  private accessToken?: { value: string; expiresAt: number };

  constructor(readonly connection: SpApiConnection) {}

  private async token(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) return this.accessToken.value;
    const { clientId, clientSecret, refreshToken } = this.connection.credentials;
    const response = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const data = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!response.ok || !data.access_token) throw new Error(`SP-API 授权失败 (${response.status})：${data.error_description ?? "未返回访问令牌"}`);
    this.accessToken = { value: data.access_token, expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000 };
    return data.access_token;
  }

  async request(method: string, path: string, options: { query?: Record<string, unknown>; body?: unknown; headers?: Record<string, string> } = {}): Promise<any> {
    const url = new URL(path, REGION_HOSTS[this.connection.region]);
    for (const [key, raw] of Object.entries(options.query ?? {})) {
      if (raw === undefined || raw === null || raw === "") continue;
      if (Array.isArray(raw)) for (const value of raw) url.searchParams.append(key, String(value));
      else url.searchParams.set(key, String(raw));
    }
    let lastError = "";
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetch(url, {
        method,
        headers: {
          accept: "application/json",
          "x-amz-access-token": await this.token(),
          ...(options.body === undefined ? {} : { "content-type": "application/json" }),
          ...options.headers,
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      if (response.status === 401 && attempt === 0) this.accessToken = undefined;
      const text = await response.text();
      const parsed = text ? safeJson(text) : null;
      if (response.ok) return parsed;
      lastError = amazonError(parsed, text, response.status);
      if (![401, 429, 500, 502, 503, 504].includes(response.status) || attempt === 3) break;
      await new Promise(resolve => setTimeout(resolve, Math.min(8000, 700 * 2 ** attempt)));
    }
    throw new Error(lastError || "Amazon SP-API 请求失败");
  }
}

function safeJson(text: string): any {
  try { return JSON.parse(text); } catch { return text; }
}

function amazonError(data: any, text: string, status: number): string {
  const detail = data?.errors?.map((item: any) => [item.code, item.message, item.details].filter(Boolean).join(": ")).join("；")
    || data?.message || (typeof data === "string" ? data : text) || "未知错误";
  return `Amazon SP-API 请求失败 (${status})：${String(detail).slice(0, 800)}`;
}

export async function testSpApiCredentials(credentials: SpApiCredentials): Promise<Omit<SpApiConnection, "credentials">> {
  for (const region of ["NA", "EU", "FE"] as const) {
    try {
      const client = new SpApiClient({ credentials, region, marketplaceId: "", marketplaceName: "", countryCode: "" });
      const result = await client.request("GET", "/sellers/v1/marketplaceParticipations");
      const rows = Array.isArray(result?.payload) ? result.payload : [];
      const active = rows.filter((row: any) => row?.participation?.isParticipating !== false && row?.marketplace?.id);
      const realMarketplaces = active.filter((row: any) => {
        const label = `${row.marketplace?.name ?? ""} ${row.marketplace?.domainName ?? ""}`.toLowerCase();
        return !label.includes("non-amazon") && !label.includes("shadow");
      });
      const preferred = realMarketplaces.find((row: any) => row.marketplace?.id === "ATVPDKIKX0DER")
        ?? realMarketplaces.find((row: any) => row.marketplace?.countryCode === "US" && String(row.marketplace?.domainName ?? "").includes("amazon.com"))
        ?? realMarketplaces[0];
      if (!preferred) continue;
      return {
        region,
        marketplaceId: preferred.marketplace.id,
        marketplaceName: preferred.marketplace.name ?? preferred.marketplace.id,
        countryCode: preferred.marketplace.countryCode ?? "",
      };
    } catch { /* Try the next region. */ }
  }
  throw new Error("凭证授权成功但未找到可参与的 Amazon Marketplace，请确认刷新令牌权限");
}

export function exploreSpApiCatalog(input: { query?: string; category?: string; method?: string; limit?: number }) {
  const query = input.query?.trim().toLowerCase();
  const category = input.category?.trim().toLowerCase();
  const method = input.method?.trim().toUpperCase();
  const limit = Math.min(50, Math.max(1, Number(input.limit ?? 20)));
  const endpoints = SP_API_ENDPOINTS.filter(endpoint => {
    const haystack = `${endpoint.id} ${endpoint.name} ${endpoint.path} ${endpoint.category}`.toLowerCase();
    return (!query || haystack.includes(query)) && (!category || endpoint.category.toLowerCase().includes(category)) && (!method || endpoint.method === method);
  }).slice(0, limit);
  return { totalCatalogEndpoints: SP_API_ENDPOINTS.length, matched: endpoints.length, endpoints };
}

export function endpointById(id: string): SpApiEndpoint {
  const endpoint = SP_API_ENDPOINTS.find(item => item.id === id);
  if (!endpoint) throw new Error(`未知 SP-API endpoint：${id}，请先调用 sp_api_explore_catalog 检索真实 Endpoint ID`);
  return endpoint;
}

export async function executeSpApiEndpoint(client: SpApiClient, endpointId: string, parameters: Record<string, any> = {}) {
  const endpoint = endpointById(endpointId);
  let path = endpoint.path;
  const consumed = new Set<string>();
  path = path.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const value = key === "sellerId"
      ? client.connection.sellerId
      : parameters[key] ?? parameters.path?.[key];
    if (value === undefined || value === null || value === "") {
      if (key === "sellerId") throw new Error(`端点 ${endpointId} 需要 Seller ID / Merchant ID，请在店铺配置中保存，不要用 marketplaceId 代替`);
      throw new Error(`端点 ${endpointId} 缺少路径参数 ${key}`);
    }
    consumed.add(key);
    return encodeURIComponent(String(value));
  });
  const explicitQuery = parameters.query && typeof parameters.query === "object" ? parameters.query : {};
  const body = parameters.body;
  const query: Record<string, unknown> = { ...explicitQuery };
  for (const [key, value] of Object.entries(parameters)) {
    if (key === "body" || key === "query" || key === "path" || consumed.has(key)) continue;
    query[key] = value;
  }
  return client.request(endpoint.method, path, { query, body });
}
