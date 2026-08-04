import { requireUser } from "@/lib/auth";
import { d1, ensureSchema } from "@/lib/db";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request);
    await ensureSchema();
    const { id } = await context.params;
    const task = await d1()
      .prepare(`SELECT asin,status FROM review_tasks WHERE id=? AND user_id=?`)
      .bind(id, user.id)
      .first<{ asin: string; status: string }>();
    if (!task) return Response.json({ error: "评论任务不存在" }, { status: 404 });
    if (!task.status.startsWith("done")) {
      return Response.json({ error: "评论任务尚未完成" }, { status: 409 });
    }
    const rows = await d1()
      .prepare(
        `SELECT asin,marketplace,review_id,user_name,rating,title,review_date,review_content,verified_purchase,helpful_votes,product_variant,images_json,page FROM review_items WHERE task_id=? ORDER BY rating ASC,review_date DESC`,
      )
      .bind(id)
      .all<Record<string, unknown>>();
    const headers = [
      "asin",
      "marketplace",
      "review_id",
      "user_name",
      "rating",
      "title",
      "review_date",
      "review_content",
      "verified_purchase",
      "helpful_votes",
      "product_variant",
      "images",
      "page",
    ];
    const lines = [
      headers.join(","),
      ...rows.results.map((row) =>
        [
          row.asin,
          row.marketplace,
          row.review_id,
          row.user_name,
          row.rating,
          row.title,
          row.review_date,
          row.review_content,
          row.verified_purchase,
          row.helpful_votes,
          row.product_variant,
          parseImages(row.images_json).join(" | "),
          row.page,
        ]
          .map(csvCell)
          .join(","),
      ),
    ];
    return new Response(`\uFEFF${lines.join("\r\n")}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="reviews_${task.asin}_${id.slice(0, 8)}.csv"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "生成 CSV 文件失败" }, { status: 400 });
  }
}

function parseImages(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
