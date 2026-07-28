import { assertSameOrigin, requireUser } from "@/lib/auth";
import { appEnv, d1 } from "@/lib/db";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const { id } = await context.params;
    const body = await request.json() as { enabled?: boolean };
    if (typeof body.enabled !== "boolean") return Response.json({ error: "enabled 必须是布尔值" }, { status: 400 });
    const result = await d1().prepare(`UPDATE custom_skills SET enabled=?,updated_at=? WHERE id=? AND user_id=?`).bind(body.enabled ? 1 : 0, Date.now(), id, user.id).run();
    if (!result.meta.changes) return Response.json({ error: "Skill 不存在" }, { status: 404 });
    return Response.json({ ok: true, enabled: body.enabled });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "更新 Skill 失败" }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const { id } = await context.params;
    const row = await d1().prepare(`SELECT object_key,name FROM custom_skills WHERE id=? AND user_id=?`).bind(id, user.id).first<{ object_key: string; name: string }>();
    if (!row) return Response.json({ error: "Skill 不存在" }, { status: 404 });
    await appEnv().FILES?.delete(row.object_key);
    await d1().batch([
      d1().prepare(`DELETE FROM custom_skills WHERE id=? AND user_id=?`).bind(id, user.id),
      d1().prepare(`INSERT INTO audit_logs(id,user_id,account_id,action,target,detail,outcome,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), user.id, null, "skill.delete", id, JSON.stringify({ name: row.name }), "success", Date.now()),
    ]);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "删除 Skill 失败" }, { status: 400 });
  }
}