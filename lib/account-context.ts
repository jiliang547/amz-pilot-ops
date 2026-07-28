export type AmazonAccountMetadata = {
  advertiserAccountId?: string;
  name?: string;
  marketplace?: string;
  timezone?: string;
  currency?: string;
};

function collectObjects(value: unknown, objects: Record<string, unknown>[]): void {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && trimmed.length < 2_000_000) {
      try { collectObjects(JSON.parse(trimmed), objects); } catch { /* MCP text may not be JSON. */ }
    }
    return;
  }
  if (Array.isArray(value)) { for (const item of value) collectObjects(item, objects); return; }
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  objects.push(object);
  for (const item of Object.values(object)) collectObjects(item, objects);
}

function findString(value: unknown, keys: string[], predicate?: (value: string) => boolean): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) { const found = findString(item, keys, predicate); if (found) return found; }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string" && keys.includes(key.toLowerCase()) && (!predicate || predicate(item))) return item;
    const found = findString(item, keys, predicate);
    if (found) return found;
  }
  return undefined;
}

function normalizeMarketplace(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(normalized)) return normalized === "GB" ? "UK" : normalized;
  const names: Record<string, string> = {
    "UNITED STATES": "US", "UNITED STATES OF AMERICA": "US", USA: "US",
    CANADA: "CA", MEXICO: "MX", "UNITED KINGDOM": "UK", GREATBRITAIN: "UK",
    GERMANY: "DE", FRANCE: "FR", ITALY: "IT", SPAIN: "ES", JAPAN: "JP",
    AUSTRALIA: "AU", INDIA: "IN", BRAZIL: "BR", NETHERLANDS: "NL",
  };
  return names[normalized.replace(/\s+/g, " ")] ?? undefined;
}

export function discoverAccountMetadata(result: unknown, profileId: string): AmazonAccountMetadata {
  const objects: Record<string, unknown>[] = [];
  collectObjects(result, objects);
  const matching = objects.filter(object => {
    try { return JSON.stringify(object).includes(profileId); } catch { return false; }
  });
  const candidates = matching.length ? matching : objects;
  for (const candidate of candidates) {
    const advertiserAccountId = findString(candidate, ["advertiseraccountid", "advertiser_account_id"], value => value.startsWith("amzn1.ads-account."))
      ?? findString(candidate, ["advertiseraccountid", "advertiser_account_id"]);
    const candidateProfile = findString(candidate, ["profileid", "profile_id"]);
    if (!advertiserAccountId && candidateProfile !== profileId) continue;
    return {
      advertiserAccountId,
      name: findString(candidate, ["name", "accountname", "advertisername"], value => value.length <= 100),
      marketplace: normalizeMarketplace(findString(candidate, ["countrycode", "country_code", "marketplacecountrycode", "marketplace", "country", "marketplaceid"])),
      timezone: findString(candidate, ["timezone", "time_zone", "accounttimezone"]),
      currency: findString(candidate, ["currencycode", "currency_code", "currency"], value => value.length <= 8)?.toUpperCase(),
    };
  }
  return {};
}

export function accountContextBlock(row: Record<string, unknown>): string {
  const marketplace = String(row.marketplace ?? "").toUpperCase();
  return `\n【本次连接的权威账户上下文】\n- 店铺：${String(row.name ?? "未命名")}\n- Amazon API 区域组：${String(row.region ?? "未知").toUpperCase()}（区域组不是站点）\n- 站点/国家：${marketplace || "尚未识别"}\n- Profile ID：${String(row.profile_id ?? "未知")}\n- Advertiser Account ID：${String(row.advertiser_account_id ?? "尚未识别")}\n- 广告账户时区：${String(row.timezone ?? "尚未识别")}\n- 币种：${String(row.currency ?? "尚未识别")}\n把以上信息作为本次会话的默认值。站点已识别时不得再次询问用户；工具需要 countries/marketplaces 时使用该站点。用户说“今天”时必须使用广告账户时区。`;
}
