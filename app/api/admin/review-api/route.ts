import { assertSameOrigin, requireUser } from "@/lib/auth";
import { encryptJson } from "@/lib/crypto";
import { d1, ensureSchema } from "@/lib/db";
import { testReviewApiKey } from "@/lib/review-api";

async function requireAdmin(request: Request) {
  const user = await requireUser(request);
  if (user.role !== "admin") {
    throw new Response(JSON.stringify({ error: "无权限" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  return user;
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    await ensureSchema();
    const row = await d1()
      .prepare(`SELECT updated_at updatedAt FROM review_api_settings WHERE id=1`)
      .first<{ updatedAt: number }>();
    return Response.json({ configured: Boolean(row), updatedAt: row?.updatedAt ?? null });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "读取评论 API 配置失败" }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAdmin(request);
    await ensureSchema();
    const body = (await request.json()) as { apiKey?: string };
    const apiKey = body.apiKey?.trim() || "";
    if (!apiKey) {
      return Response.json({ error: "请输入评论获取 API Key" }, { status: 400 });
    }
    if (apiKey.length > 1000) {
      return Response.json({ error: "API Key 内容过长" }, { status: 400 });
    }

    await testReviewApiKey(apiKey);
    const now = Date.now();
    await d1().batch([
      d1()
        .prepare(
          `INSERT INTO review_api_settings(id,encrypted_api_key,updated_by,updated_at) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET encrypted_api_key=excluded.encrypted_api_key,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
        )
        .bind(await encryptJson({ apiKey }), user.id, now),
      d1()
        .prepare(
          `INSERT INTO audit_logs(id,user_id,account_id,action,target,detail,outcome,created_at) VALUES(?,?,?,?,?,?,?,?)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          null,
          "review_api.configure",
          "default",
          "Review API key tested and encrypted",
          "success",
          now,
        ),
    ]);
    return Response.json({ ok: true, configured: true, updatedAt: now });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json(
      { error: error instanceof Error ? error.message : "保存评论 API Key 失败" },
      { status: 400 },
    );
  }
}
