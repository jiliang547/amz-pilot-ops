import { requireUser } from "@/lib/auth";
import { d1, ensureSchema } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request); await ensureSchema();
    const jobs = await d1().prepare(`SELECT id,account_id accountId,report_id reportId,create_tool createTool,status,error,created_at createdAt,updated_at updatedAt,completed_at completedAt FROM report_jobs WHERE user_id=? ORDER BY created_at DESC LIMIT 100`).bind(user.id).all<Record<string, unknown>>();
    const result = [];
    for (const job of jobs.results) {
      const files = await d1().prepare(`SELECT part_number partNumber,filename,size,row_count rowCount FROM report_files WHERE report_job_id=? ORDER BY part_number`).bind(job.id).all();
      result.push({ ...job, files: files.results });
    }
    return Response.json({ reports: result });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "读取报表记录失败" }, { status: 400 });
  }
}
