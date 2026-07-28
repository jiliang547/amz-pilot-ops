import { assertSameOrigin, requireUser } from "@/lib/auth";
import { appEnv, d1 } from "@/lib/db";
import { parseSkillDocument, type SkillSummary } from "@/lib/custom-skills";

const MAX_SKILL_SIZE = 256 * 1024;
const ALLOWED = new Set(["text/plain", "text/markdown", "text/x-markdown", "application/json"]);

function normalizedType(file: File): string {
  const type = file.type.toLowerCase();
  if (ALLOWED.has(type)) return type;
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "md" || extension === "markdown") return "text/markdown";
  if (extension === "txt") return "text/plain";
  if (extension === "json") return "application/json";
  return "";
}

function safeName(name: string): string {
  return name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120) || "SKILL.md";
}

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const rows = await d1().prepare(`SELECT id,name,description,filename,content_type contentType,size,enabled,created_at createdAt,updated_at updatedAt FROM custom_skills WHERE user_id=? ORDER BY updated_at DESC`).bind(user.id).all<Omit<SkillSummary, "enabled"> & { enabled: number }>();
    return Response.json({ skills: (rows.results ?? []).map(row => ({ ...row, enabled: Boolean(row.enabled) })) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "读取 Skill 失败" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  let objectKey = "";
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    if (user.mustChangePassword) return Response.json({ error: "首次登录必须先修改密码" }, { status: 428 });
    const bucket = appEnv().FILES;
    if (!bucket) return Response.json({ error: "Skill 文件存储尚未配置" }, { status: 503 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "请选择 Skill 文件" }, { status: 400 });
    const contentType = normalizedType(file);
    if (!ALLOWED.has(contentType)) return Response.json({ error: "暂支持 SKILL.md、Markdown、TXT 和 JSON Skill" }, { status: 415 });
    if (file.size <= 0 || file.size > MAX_SKILL_SIZE) return Response.json({ error: "Skill 文件必须小于 256 KB" }, { status: 413 });
    const filename = safeName(file.name);
    const parsed = parseSkillDocument(filename, contentType, await file.text());
    const id = crypto.randomUUID(), now = Date.now();
    objectKey = `skills/${user.id}/${id}/${filename}`;
    await bucket.put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType }, customMetadata: { userId: user.id, filename, kind: "custom-skill" } });
    await d1().batch([
      d1().prepare(`INSERT INTO custom_skills(id,user_id,name,description,instructions,object_key,filename,content_type,size,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, user.id, parsed.name, parsed.description, parsed.instructions, objectKey, filename, contentType, file.size, 1, now, now),
      d1().prepare(`INSERT INTO audit_logs(id,user_id,account_id,action,target,detail,outcome,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), user.id, null, "skill.upload", id, JSON.stringify({ name: parsed.name, filename, size: file.size }), "success", now),
    ]);
    return Response.json({ skill: { id, name: parsed.name, description: parsed.description, filename, contentType, size: file.size, enabled: true, createdAt: now, updatedAt: now } }, { status: 201 });
  } catch (error) {
    if (objectKey) await appEnv().FILES?.delete(objectKey);
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Skill 上传失败";
    const duplicate = /UNIQUE|unique/i.test(message);
    return Response.json({ error: duplicate ? "已有同名 Skill，请先删除旧版本或修改 name" : message }, { status: duplicate ? 409 : 400 });
  }
}