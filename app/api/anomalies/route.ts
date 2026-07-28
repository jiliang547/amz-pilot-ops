import { assertSameOrigin, requireUser } from "@/lib/auth";
import { anomalyHistory, runAnomalyAnalysis } from "@/lib/anomaly-analysis";
import { d1, ensureSchema } from "@/lib/db";

const TABLES = [
  ["campaign", "ad_daily_facts"],
  ["keyword", "ad_keyword_daily_facts"],
  ["searchTerm", "ad_search_term_daily_facts"],
] as const;

async function owned(userId: string, accountId: string) {
  return d1().prepare(`SELECT id FROM accounts WHERE id=? AND user_id=?`).bind(accountId, userId).first();
}

async function coverage(userId: string, accountId: string) {
  const rows = [];
  for (const [reportKind, table] of TABLES) {
    const row = await d1().prepare(`SELECT MIN(report_date) minDate,MAX(report_date) maxDate,COUNT(*) rowCount,COUNT(DISTINCT report_date) dateCount FROM ${table} WHERE user_id=? AND account_id=?`).bind(userId, accountId).first<Record<string, unknown>>();
    rows.push({ reportKind, minDate: row?.minDate ?? null, maxDate: row?.maxDate ?? null, rowCount: Number(row?.rowCount ?? 0), dateCount: Number(row?.dateCount ?? 0) });
  }
  return rows;
}

export async function GET(request: Request) {
  try {
    await ensureSchema();
    const user = await requireUser(request), url = new URL(request.url), accountId = url.searchParams.get("accountId") ?? "";
    if (!accountId) return Response.json({ error: "请选择店铺" }, { status: 400 });
    if (!await owned(user.id, accountId)) return Response.json({ error: "店铺不存在" }, { status: 404 });
    return Response.json({ ...(await anomalyHistory(user.id, accountId, url.searchParams.get("date"))), coverage: await coverage(user.id, accountId) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "异常历史读取失败" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureSchema();
    const user = await requireUser(request), body = await request.json() as { accountId?: string };
    if (!body.accountId) return Response.json({ error: "请选择店铺" }, { status: 400 });
    if (!await owned(user.id, body.accountId)) return Response.json({ error: "店铺不存在" }, { status: 404 });
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        void (async () => {
          try {
            const analysis = await runAnomalyAnalysis(user.id, body.accountId!, { force: true, onStatus: text => send("status", { text }) });
            send("done", { analysis, ...(await anomalyHistory(user.id, body.accountId!)), coverage: await coverage(user.id, body.accountId!) });
          } catch (error) {
            send("error", { message: error instanceof Error ? error.message : "异常分析失败" });
          } finally {
            controller.close();
          }
        })();
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "异常分析失败" }, { status: 400 });
  }
}
