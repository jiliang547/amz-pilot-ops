import { assertSameOrigin, requireUser } from "@/lib/auth";
import { getReviewAnalysis, runReviewAnalysis } from "@/lib/review-analysis";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request);
    const { id } = await context.params;
    return Response.json({ analysis: await getReviewAnalysis(id, user.id) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json(
      { error: error instanceof Error ? error.message : "读取评论分析失败" },
      { status: 400 },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const { id } = await context.params;
    return Response.json({ analysis: await runReviewAnalysis(id, user.id) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json(
      { error: error instanceof Error ? error.message : "评论分析失败" },
      { status: 400 },
    );
  }
}
