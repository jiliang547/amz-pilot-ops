import { requireUser } from "@/lib/auth";
import { d1, ensureSchema } from "@/lib/db";

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function beijingDateKey(timestamp: number): string {
  return new Date(timestamp + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    await ensureSchema();

    const now = Date.now();
    const todayKey = beijingDateKey(now);
    const todayStart = Date.parse(`${todayKey}T00:00:00+08:00`);
    const rangeStart = todayStart - 6 * DAY_MS;
    const result = await d1()
      .prepare(
        `SELECT date(created_at / 1000, 'unixepoch', '+8 hours') AS date,
          SUM(input_tokens) AS inputTokens,
          SUM(output_tokens) AS outputTokens,
          SUM(input_tokens + output_tokens) AS totalTokens,
          SUM(provider_reported) AS providerReportedCount,
          COUNT(*) - SUM(provider_reported) AS estimatedCount
        FROM model_token_usage
        WHERE user_id=? AND created_at>=?
        GROUP BY date
        ORDER BY date`,
      )
      .bind(user.id, rangeStart)
      .all<{
        date: string;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        providerReportedCount: number;
        estimatedCount: number;
      }>();

    const byDate = new Map(result.results.map((row) => [row.date, row]));
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = beijingDateKey(rangeStart + index * DAY_MS);
      const row = byDate.get(date);
      return {
        date,
        inputTokens: Number(row?.inputTokens ?? 0),
        outputTokens: Number(row?.outputTokens ?? 0),
        totalTokens: Number(row?.totalTokens ?? 0),
      };
    });
    const today = days[6];

    return Response.json(
      {
        timezone: "Asia/Shanghai",
        today,
        days,
        providerReportedCount: result.results.reduce(
          (sum, row) => sum + Number(row.providerReportedCount ?? 0),
          0,
        ),
        estimatedCount: result.results.reduce(
          (sum, row) => sum + Number(row.estimatedCount ?? 0),
          0,
        ),
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Token 用量读取失败" }, { status: 500 });
  }
}
