import { requireUser } from "@/lib/auth";
import { d1, ensureSchema } from "@/lib/db";
import { fetchReviewResult, getReviewApiKey, type ReviewItem } from "@/lib/review-api";

type UpstreamTask = {
  star: string;
  taskId: string;
  status: "processing" | "done" | "failed";
  error?: string;
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request);
    await ensureSchema();
    const { id } = await context.params;
    let task = await loadTask(id, user.id);
    if (!task) return Response.json({ error: "评论任务不存在" }, { status: 404 });

    const upstreamForRepair = parseUpstreamTasks(task.upstream_tasks_json);
    const needsReviewCountRepair =
      Number(task.review_count || 0) === 0 &&
      String(task.status) === "done" &&
      upstreamForRepair.some((item) => item.status === "done" && item.taskId);
    if (needsReviewCountRepair) {
      const retryTasks = upstreamForRepair.map((item) =>
        item.status === "done" ? { ...item, status: "processing" as const } : item,
      );
      await d1()
        .prepare(`UPDATE review_tasks SET status='processing',upstream_tasks_json=?,updated_at=? WHERE id=? AND user_id=?`)
        .bind(JSON.stringify(retryTasks), Date.now(), id, user.id)
        .run();
      task = (await loadTask(id, user.id)) || task;
    }
    if (["submitting", "processing"].includes(String(task.status))) {
      task = await refreshTask(task, user.id);
    }
    const reviews = await d1()
      .prepare(
        `SELECT review_id reviewId,asin,marketplace,user_name userName,rating,title,review_date reviewDate,review_content reviewContent,verified_purchase verifiedPurchase,helpful_votes helpfulVotes,product_variant productVariant,images_json imagesJson,page FROM review_items WHERE task_id=? ORDER BY rating ASC,review_date DESC LIMIT 100`,
      )
      .bind(id)
      .all();
    return Response.json({
      task: serializeTask(task),
      reviews: reviews.results.map((review) => ({
        ...review,
        images: parseJsonArray(review.imagesJson),
        imagesJson: undefined,
      })),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json(
      { error: error instanceof Error ? error.message : "读取评论任务失败" },
      { status: 400 },
    );
  }
}

async function refreshTask(
  task: Record<string, unknown>,
  userId: string,
): Promise<Record<string, unknown>> {
  const apiKey = await getReviewApiKey();
  if (!apiKey) {
    await d1()
      .prepare(`UPDATE review_tasks SET status='failed',error=?,updated_at=?,completed_at=? WHERE id=? AND user_id=?`)
      .bind("管理员已移除评论 API Key", Date.now(), Date.now(), task.id, userId)
      .run();
    return (await loadTask(String(task.id), userId)) || task;
  }

  const upstreamTasks = parseUpstreamTasks(task.upstream_tasks_json);
  const refreshed: UpstreamTask[] = [];
  for (const upstream of upstreamTasks) {
    if (upstream.status !== "processing" || !upstream.taskId) {
      refreshed.push(upstream);
      continue;
    }
    try {
      const result = await fetchReviewResult(apiKey, upstream.taskId);
      if (result.status === "done") {
        await storeReviews(String(task.id), result.reviews);
        refreshed.push({ ...upstream, status: "done" });
      } else if (result.status === "failed") {
        refreshed.push({ ...upstream, status: "failed", error: result.error });
      } else {
        refreshed.push(upstream);
      }
    } catch (error) {
      refreshed.push({
        ...upstream,
        status: "failed",
        error: error instanceof Error ? error.message : "查询上游任务失败",
      });
    }
  }

  const processing = refreshed.some((item) => item.status === "processing");
  const done = refreshed.filter((item) => item.status === "done").length;
  const failures = refreshed
    .filter((item) => item.status === "failed")
    .map((item) => `${item.star}: ${item.error || "任务失败"}`);
  const status = processing
    ? "processing"
    : done && failures.length
      ? "done_with_errors"
      : done
        ? "done"
        : "failed";
  const count = await d1()
    .prepare(`SELECT COUNT(*) count FROM review_items WHERE task_id=?`)
    .bind(task.id)
    .first<{ count: number }>();
  const now = Date.now();
  await d1()
    .prepare(
      `UPDATE review_tasks SET status=?,upstream_tasks_json=?,review_count=?,error=?,updated_at=?,completed_at=? WHERE id=? AND user_id=?`,
    )
    .bind(
      status,
      JSON.stringify(refreshed),
      Number(count?.count || 0),
      failures.length ? failures.join("；") : null,
      now,
      processing ? null : now,
      task.id,
      userId,
    )
    .run();
  return (await loadTask(String(task.id), userId)) || task;
}

async function storeReviews(taskId: string, reviews: ReviewItem[]) {
  const statements = [];
  for (const review of reviews) {
    const reviewId = review.reviewId || (await fallbackReviewId(review));
    statements.push(
      d1()
        .prepare(
          `INSERT OR IGNORE INTO review_items(id,task_id,review_id,asin,marketplace,user_name,rating,title,review_date,review_content,verified_purchase,helpful_votes,product_variant,images_json,page,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          crypto.randomUUID(),
          taskId,
          reviewId,
          review.asin,
          review.marketplace,
          review.userName,
          review.rating,
          review.title,
          review.reviewDate,
          review.reviewContent,
          review.verifiedPurchase,
          review.helpfulVotes,
          review.productVariant,
          JSON.stringify(review.images),
          review.page,
          Date.now(),
        ),
    );
  }
  for (let index = 0; index < statements.length; index += 200) {
    await d1().batch(statements.slice(index, index + 200));
  }
}

async function fallbackReviewId(review: ReviewItem): Promise<string> {
  const source = `${review.asin}|${review.userName}|${review.reviewDate}|${review.title}|${review.reviewContent}`;
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source)),
  );
  return `generated-${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function loadTask(id: string, userId: string) {
  return d1()
    .prepare(`SELECT * FROM review_tasks WHERE id=? AND user_id=?`)
    .bind(id, userId)
    .first<Record<string, unknown>>();
}

function serializeTask(task: Record<string, unknown>) {
  return {
    id: task.id,
    asin: task.asin,
    marketplace: task.marketplace,
    pages: task.pages,
    starMode: task.star_mode,
    stars: parseJsonArray(task.stars_json),
    sortBy: task.sort_by,
    reviewerType: task.reviewer_type,
    mediaType: task.media_type,
    variant: task.variant,
    status: task.status,
    reviewCount: task.review_count,
    error: task.error,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    completedAt: task.completed_at,
  };
}

function parseUpstreamTasks(value: unknown): UpstreamTask[] {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? (parsed as UpstreamTask[]) : [];
  } catch {
    return [];
  }
}

function parseJsonArray(value: unknown): unknown[] {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
