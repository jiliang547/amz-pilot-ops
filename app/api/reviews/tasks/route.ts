import { assertSameOrigin, requireUser } from "@/lib/auth";
import { d1, ensureSchema } from "@/lib/db";
import {
  expandStarMode,
  getReviewApiKey,
  submitReviewTask,
  type ReviewStarMode,
} from "@/lib/review-api";

const marketplaces = new Set([
  "US",
  "CA",
  "MX",
  "BR",
  "UK",
  "DE",
  "FR",
  "IT",
  "ES",
  "NL",
  "SE",
  "PL",
  "BE",
  "JP",
  "AU",
  "IN",
  "SG",
  "AE",
  "SA",
  "TR",
]);
const starModes = new Set([
  "one_star",
  "two_star",
  "three_star",
  "four_star",
  "five_star",
  "critical",
  "positive",
  "all_stars",
]);

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    await ensureSchema();
    const rows = await d1()
      .prepare(
        `SELECT id,asin,marketplace,pages,star_mode starMode,stars_json starsJson,sort_by sortBy,reviewer_type reviewerType,media_type mediaType,variant,status,review_count reviewCount,error,created_at createdAt,updated_at updatedAt,completed_at completedAt FROM review_tasks WHERE user_id=? ORDER BY created_at DESC LIMIT 100`,
      )
      .bind(user.id)
      .all();
    return Response.json({
      tasks: rows.results.map((row) => ({
        ...row,
        stars: parseJsonArray(row.starsJson),
        starsJson: undefined,
      })),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "读取评论任务失败" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    await ensureSchema();
    const apiKey = await getReviewApiKey();
    if (!apiKey) {
      return Response.json(
        { error: "管理员尚未配置评论获取 API Key" },
        { status: 409 },
      );
    }

    const body = (await request.json()) as {
      asin?: string;
      marketplace?: string;
      pages?: number;
      starMode?: ReviewStarMode;
      sortBy?: "recent" | "helpful";
      reviewerType?: "all_reviews" | "avp_only_reviews";
      mediaType?: "all_contents" | "media_reviews_only";
      variant?: "all_formats" | "current_format";
    };
    const asin = body.asin?.trim().toUpperCase() || "";
    const marketplace = body.marketplace?.trim().toUpperCase() || "US";
    const pages = Number(body.pages);
    const starMode = body.starMode || "all_stars";
    const sortBy = body.sortBy === "helpful" ? "helpful" : "recent";
    const reviewerType =
      body.reviewerType === "avp_only_reviews"
        ? "avp_only_reviews"
        : "all_reviews";
    const mediaType =
      body.mediaType === "media_reviews_only"
        ? "media_reviews_only"
        : "all_contents";
    const variant =
      body.variant === "current_format" ? "current_format" : "all_formats";

    if (!/^[A-Z0-9]{10}$/.test(asin)) {
      return Response.json({ error: "请输入有效的 10 位 ASIN" }, { status: 400 });
    }
    if (!marketplaces.has(marketplace)) {
      return Response.json({ error: "不支持所选站点" }, { status: 400 });
    }
    if (!Number.isInteger(pages) || pages < 1 || pages > 10) {
      return Response.json({ error: "抓取页数必须为 1–10" }, { status: 400 });
    }
    if (!starModes.has(starMode)) {
      return Response.json({ error: "星级筛选参数无效" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    const stars = expandStarMode(starMode);
    await d1()
      .prepare(
        `INSERT INTO review_tasks(id,user_id,asin,marketplace,request_json,external_tasks,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?, ?,?)`,
      )
      .bind(
        id,
        user.id,
        asin,
        marketplace,
        JSON.stringify({ asin, marketplace, pages, starMode, sortBy, reviewerType, mediaType, variant }),
        "[]",
        "submitting",
        now,
        now,
      )
      .run();

    await d1()
      .prepare(
        `UPDATE review_tasks SET pages=?,star_mode=?,stars_json=?,sort_by=?,reviewer_type=?,media_type=?,variant=?,upstream_tasks_json='[]',review_count=0,error=NULL,completed_at=NULL WHERE id=?`,
      )
      .bind(pages, starMode, JSON.stringify(stars), sortBy, reviewerType, mediaType, variant, id)
      .run();

    const results = await Promise.allSettled(
      stars.map(async (star) => ({
        star,
        taskId: await submitReviewTask(apiKey, {
          asin,
          marketplace,
          pages,
          filterStar: star,
          filterSortBy: sortBy,
          filterReviewerType: reviewerType,
          filterMediaType: mediaType,
          filterVariant: variant,
        }),
        status: "processing" as const,
      })),
    );
    const upstreamTasks = results.map((result, index) =>
      result.status === "fulfilled"
        ? result.value
        : {
            star: stars[index],
            taskId: "",
            status: "failed" as const,
            error:
              result.reason instanceof Error
                ? result.reason.message
                : "上游任务提交失败",
          },
    );
    const accepted = upstreamTasks.filter((task) => task.taskId).length;
    const errors = upstreamTasks
      .filter((task) => task.status === "failed")
      .map((task) => `${task.star}: ${task.error}`);
    const status = accepted ? "processing" : "failed";
    await d1()
      .prepare(
        `UPDATE review_tasks SET status=?,upstream_tasks_json=?,external_tasks=?,error=?,updated_at=?,completed_at=? WHERE id=?`,
      )
      .bind(
        status,
        JSON.stringify(upstreamTasks),
        JSON.stringify(upstreamTasks),
        errors.length ? errors.join("；") : null,
        Date.now(),
        accepted ? null : Date.now(),
        id,
      )
      .run();

    if (!accepted) {
      return Response.json(
        { error: errors[0] || "评论任务提交失败", taskId: id },
        { status: 502 },
      );
    }
    return Response.json(
      { ok: true, taskId: id, upstreamTaskCount: accepted, warning: errors.join("；") || null },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json(
      { error: error instanceof Error ? error.message : "提交评论任务失败" },
      { status: 400 },
    );
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
