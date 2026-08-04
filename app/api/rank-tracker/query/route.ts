import { assertSameOrigin, requireUser } from "../../../../lib/auth";
import { decryptJson } from "../../../../lib/crypto";
import { appEnv, d1, ensureSchema } from "../../../../lib/db";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureSchema();
    const user = await requireUser(request);
    const body = await request.json() as { asin?: string; keyword?: string; maxPages?: number };
    const asin = (body.asin ?? "").trim().toUpperCase();
    const keyword = (body.keyword ?? "").trim();
    if (!/^[A-Z0-9]{10}$/.test(asin) || !keyword) {
      return Response.json({ error: "请输入有效 ASIN 和关键词" }, { status: 400 });
    }
    const row = await d1().prepare("SELECT encrypted_proxies FROM rank_tracker_settings WHERE user_id=?")
      .bind(user.id).first<{ encrypted_proxies: string }>();
    if (!row) return Response.json({ error: "请先配置代理" }, { status: 400 });
    const proxies = await decryptJson(row.encrypted_proxies);
    const rankEnv = appEnv() as ReturnType<typeof appEnv> & { RANK_CONTAINER?: { getByName(name: string): { fetch(request: Request): Promise<Response> } } };
    if (!rankEnv.RANK_CONTAINER) return Response.json({ error: "Cloudflare Playwright 容器尚未接入" }, { status: 503 });
    const container = rankEnv.RANK_CONTAINER.getByName("rank-tracker");
    const upstream = await container.fetch(new Request("http://rank-container/rank", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ asin, keyword, maxPages: Math.max(1, Math.min(5, body.maxPages ?? 5)), proxies })
    }));
    const result = await upstream.json().catch(() => ({ error: "排名服务返回无效数据" }));
    if (!upstream.ok) return Response.json(result, { status: upstream.status });
    const id = crypto.randomUUID();
    const now = Date.now();
    const variantAsins = Array.isArray(result.variant_asins) ? result.variant_asins : result.variant_asin ? [result.variant_asin] : [];
    await d1().prepare("INSERT INTO rank_history(id,user_id,asin,keyword,status,rank,page,position,variant_asin,variant_asins_json,sponsored_count,total_results,proxy_host,actual_ip,error,scraped_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, user.id, asin, keyword, result.status ?? (result.found ? "found" : "not_found"), result.rank ?? null, result.page ?? null, result.position ?? null, result.variant_asin ?? null, JSON.stringify(variantAsins), result.sponsored_count ?? null, result.total_results ?? null, result.proxy_host ?? null, result.actual_ip ?? null, result.error ?? null, now).run();
    return Response.json({ ...result, variant_asins: variantAsins, id, scrapedAt: now });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "查询失败" }, { status: 400 });
  }
}
