import { appEnv, d1, ensureSchema } from "@/lib/db";
import { anomalyHistory } from "@/lib/anomaly-analysis";
import { runManualReportSnapshots } from "@/lib/snapshot-reports";

const TABLES = [
  ["campaign", "ad_daily_facts"],
  ["keyword", "ad_keyword_daily_facts"],
  ["searchTerm", "ad_search_term_daily_facts"],
] as const;

async function coverage(userId: string, accountId: string) {
  const result = [];
  for (const [reportKind, table] of TABLES) {
    const row = await d1().prepare(`SELECT MIN(report_date) minDate,MAX(report_date) maxDate,COUNT(*) rowCount,COUNT(DISTINCT report_date) dateCount FROM ${table} WHERE user_id=? AND account_id=?`).bind(userId, accountId).first<Record<string, unknown>>();
    result.push({ reportKind, minDate: row?.minDate ?? null, maxDate: row?.maxDate ?? null, rowCount: Number(row?.rowCount ?? 0), dateCount: Number(row?.dateCount ?? 0) });
  }
  return result;
}

export async function POST(request: Request) {
  const expected = appEnv().INITIALIZE_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  await ensureSchema();
  const body = await request.json().catch(() => ({})) as { username?: string };
  const username = body.username?.trim() || "jiliang";
  const accounts = await d1().prepare(`SELECT a.id accountId,a.user_id userId,a.name FROM accounts a JOIN users u ON u.id=a.user_id WHERE u.username=? ORDER BY a.updated_at`).bind(username).all<{ accountId: string; userId: string; name: string }>();
  if (!accounts.results.length) return Response.json({ error: "目标账号没有已连接店铺" }, { status: 404 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      void (async () => {
        const results = [];
        try {
          for (let index = 0; index < accounts.results.length; index++) {
            const account = accounts.results[index];
            send("status", { text: `开始初始化店铺 ${index + 1}/${accounts.results.length}：${account.name}` });
            const refresh = await runManualReportSnapshots(account.userId, account.accountId, text => send("status", { accountId: account.accountId, text }), { forceInitial: true });
            results.push({ accountId: account.accountId, name: account.name, refresh, coverage: await coverage(account.userId, account.accountId), history: await anomalyHistory(account.userId, account.accountId) });
          }
          send("done", { username, results });
        } catch (error) {
          send("error", { message: error instanceof Error ? error.message : "初始化失败", partial: results });
        } finally {
          controller.close();
        }
      })();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" } });
}
