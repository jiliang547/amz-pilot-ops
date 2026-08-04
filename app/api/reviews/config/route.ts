import { requireUser } from "@/lib/auth";
import { d1, ensureSchema } from "@/lib/db";

export async function GET(request: Request) {
  try {
    await requireUser(request);
    await ensureSchema();
    const row = await d1()
      .prepare(`SELECT updated_at updatedAt FROM review_api_settings WHERE id=1`)
      .first<{ updatedAt: number }>();
    return Response.json({ configured: Boolean(row), updatedAt: row?.updatedAt ?? null });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "读取评论功能状态失败" }, { status: 400 });
  }
}
