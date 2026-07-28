import { requireUser } from "@/lib/auth";
import { appEnv, d1, ensureSchema } from "@/lib/db";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request); await ensureSchema();
    const { id } = await context.params;
    const part = Math.max(1, Number(new URL(request.url).searchParams.get("part") ?? 1));
    const file = await d1().prepare(`SELECT f.object_key objectKey,f.filename,f.content_type contentType FROM report_files f JOIN report_jobs j ON j.id=f.report_job_id WHERE j.id=? AND j.user_id=? AND f.part_number=?`).bind(id, user.id, part).first<{ objectKey: string; filename: string; contentType: string }>();
    if (!file) return Response.json({ error: "报表文件不存在或无权访问" }, { status: 404 });
    const object = await appEnv().FILES?.get(file.objectKey);
    if (!object) return Response.json({ error: "报表文件已不存在" }, { status: 404 });
    return new Response(await object.arrayBuffer(), { headers: { "content-type": file.contentType, "content-disposition": `attachment; filename="${file.filename}"`, "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "下载报表失败" }, { status: 400 });
  }
}
