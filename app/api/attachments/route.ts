import { assertSameOrigin, requireUser } from "@/lib/auth";
import { appEnv, d1 } from "@/lib/db";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "text/plain", "text/csv", "text/markdown", "text/x-markdown", "application/json"]);
function normalizedType(file: File) { const type = file.type.toLowerCase(); if (type) return type; const ext = file.name.toLowerCase().split(".").pop(); return ext === "md" ? "text/markdown" : ext === "txt" ? "text/plain" : ext === "csv" ? "text/csv" : ext === "json" ? "application/json" : ""; }
function safeName(name: string) { return name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120) || "attachment"; }

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    if (user.mustChangePassword) return Response.json({ error: "首次登录必须先修改密码" }, { status: 428 });
    const bucket = appEnv().FILES;
    if (!bucket) return Response.json({ error: "附件存储尚未配置" }, { status: 503 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "请选择文件" }, { status: 400 });
    const contentType = normalizedType(file);
    if (!ALLOWED.has(contentType)) return Response.json({ error: "暂支持 PNG、JPG、WEBP、GIF、TXT、CSV、JSON 和 Markdown" }, { status: 415 });
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) return Response.json({ error: "单个附件必须小于 10 MB" }, { status: 413 });
    const id = crypto.randomUUID();
    const filename = safeName(file.name);
    const objectKey = `${user.id}/${id}/${filename}`;
    await bucket.put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType }, customMetadata: { userId: user.id, filename } });
    try {
      await d1().prepare(`INSERT INTO attachments(id,user_id,object_key,filename,content_type,size,created_at) VALUES(?,?,?,?,?,?,?)`).bind(id, user.id, objectKey, filename, contentType, file.size, Date.now()).run();
    } catch (error) { await bucket.delete(objectKey); throw error; }
    return Response.json({ attachment: { id, filename, contentType, size: file.size } }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "上传失败" }, { status: 400 });
  }
}
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ error: "缺少附件 ID" }, { status: 400 });
    const row = await d1().prepare(`SELECT object_key,message_id FROM attachments WHERE id=? AND user_id=?`).bind(id, user.id).first<{ object_key: string; message_id: string | null }>();
    if (!row) return Response.json({ error: "附件不存在" }, { status: 404 });
    if (row.message_id) return Response.json({ error: "已随消息发送的附件不能删除" }, { status: 409 });
    await appEnv().FILES?.delete(row.object_key);
    await d1().prepare(`DELETE FROM attachments WHERE id=? AND user_id=? AND message_id IS NULL`).bind(id, user.id).run();
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "删除失败" }, { status: 400 });
  }
}