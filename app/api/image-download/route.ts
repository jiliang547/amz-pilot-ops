import { requireUser } from "@/lib/auth";
import { appEnv } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const url = new URL(request.url);
    const jobId = url.searchParams.get("jobId");
    const index = url.searchParams.get("index");
    if (!jobId || !index) return Response.json({ error: "缺少图片参数" }, { status: 400 });
    const object = await appEnv().FILES?.get("generated-images/" + user.id + "/" + jobId + "/" + index + ".png");
    if (!object) return Response.json({ error: "图片不存在" }, { status: 404 });
    return new Response(await object.arrayBuffer(), {
      headers: {
        "content-type": "image/png",
                "content-disposition": "attachment; filename=amazon-image-" + index + ".png"
      }
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "图片下载失败" }, { status: 400 });
  }
}


