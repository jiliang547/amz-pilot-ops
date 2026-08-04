import { decryptJson } from "./crypto";
import { d1 } from "./db";

export const REVIEW_API_BASE_URL = "https://server.reveyes.cn/api/open";

export const STAR_FILTERS = [
  "one_star",
  "two_star",
  "three_star",
  "four_star",
  "five_star",
] as const;

export type ReviewStarFilter = (typeof STAR_FILTERS)[number];
export type ReviewStarMode = ReviewStarFilter | "critical" | "positive" | "all_stars";

export type ReviewItem = {
  asin: string;
  marketplace: string;
  reviewId: string;
  userName: string;
  rating: number;
  title: string;
  reviewDate: string;
  reviewContent: string;
  verifiedPurchase: number;
  helpfulVotes: number;
  productVariant: string;
  images: string[];
  page: number;
};

type UpstreamEnvelope = {
  code?: number;
  message?: string;
  data?: unknown;
  status?: string;
};

export function expandStarMode(mode: ReviewStarMode): ReviewStarFilter[] {
  if (mode === "critical") return STAR_FILTERS.slice(0, 3);
  if (mode === "positive") return STAR_FILTERS.slice(3);
  if (mode === "all_stars") return [...STAR_FILTERS];
  return STAR_FILTERS.includes(mode) ? [mode] : [...STAR_FILTERS];
}

export async function getReviewApiKey(): Promise<string | null> {
  const row = await d1()
    .prepare(`SELECT encrypted_api_key FROM review_api_settings WHERE id=1`)
    .first<{ encrypted_api_key: string }>();
  if (!row?.encrypted_api_key) return null;
  const secret = await decryptJson<{ apiKey: string }>(row.encrypted_api_key);
  return secret.apiKey;
}

async function readEnvelope(response: Response): Promise<UpstreamEnvelope> {
  const text = await response.text();
  let payload: UpstreamEnvelope;
  try {
    payload = JSON.parse(text) as UpstreamEnvelope;
  } catch {
    throw new Error(`评论服务返回了无法识别的内容（HTTP ${response.status}）`);
  }
  if (!response.ok || payload.code !== 0) {
    throw new Error(payload.message || `评论服务请求失败（HTTP ${response.status}）`);
  }
  return payload;
}

export async function testReviewApiKey(apiKey: string): Promise<void> {
  const response = await fetch(`${REVIEW_API_BASE_URL}/v1/tasks?page=1&page_size=1`, {
    headers: { "X-API-Key": apiKey, accept: "application/json" },
  });
  await readEnvelope(response);
}

export async function submitReviewTask(
  apiKey: string,
  input: {
    asin: string;
    marketplace: string;
    pages: number;
    filterStar: ReviewStarFilter;
    filterSortBy: "recent" | "helpful";
    filterReviewerType: "all_reviews" | "avp_only_reviews";
    filterMediaType: "all_contents" | "media_reviews_only";
    filterVariant: "all_formats" | "current_format";
  },
): Promise<string> {
  const response = await fetch(`${REVIEW_API_BASE_URL}/v1/reviews/fetch`, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      asins: [
        {
          asin: input.asin,
          marketplace: input.marketplace,
          pages: input.pages,
          filter_star: input.filterStar,
          filter_sort_by: input.filterSortBy,
          filter_reviewer_type: input.filterReviewerType,
          filter_media_type: input.filterMediaType,
          filter_variant: input.filterVariant,
        },
      ],
    }),
  });
  const payload = await readEnvelope(response);
  const data = asRecord(payload.data);
  const taskId = stringValue(data.task_id ?? data.taskId ?? data.id);
  if (!taskId) throw new Error("评论服务未返回任务 ID");
  return taskId;
}

export async function fetchReviewResult(
  apiKey: string,
  upstreamTaskId: string,
): Promise<{ status: "processing" | "done" | "failed"; reviews: ReviewItem[]; error?: string }> {
  const first = await fetchReviewResultPage(apiKey, upstreamTaskId, 1);
  if (first.status !== "done") return first;

  const reviews = [...first.reviews];
  for (let page = 2; page <= first.totalPages; page += 1) {
    const next = await fetchReviewResultPage(apiKey, upstreamTaskId, page);
    reviews.push(...next.reviews);
  }
  return { status: "done", reviews: dedupeReviews(reviews) };
}

async function fetchReviewResultPage(
  apiKey: string,
  upstreamTaskId: string,
  page: number,
): Promise<{
  status: "processing" | "done" | "failed";
  reviews: ReviewItem[];
  totalPages: number;
  error?: string;
}> {
  const url = new URL(
    `${REVIEW_API_BASE_URL}/v1/reviews/result/${encodeURIComponent(upstreamTaskId)}`,
  );
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", "100");
  const response = await fetch(url, {
    headers: { "X-API-Key": apiKey, accept: "application/json" },
  });
  const payload = await readEnvelope(response);
  const data = asRecord(payload.data);
  const rawStatus = stringValue(data.status ?? payload.status).toLowerCase();
  if (["failed", "error", "cancelled", "canceled"].includes(rawStatus)) {
    return {
      status: "failed",
      reviews: [],
      totalPages: 1,
      error: stringValue(data.error ?? data.message ?? payload.message) || "评论任务执行失败",
    };
  }
  if (!["done", "completed", "success", "succeeded"].includes(rawStatus)) {
    return { status: "processing", reviews: [], totalPages: 1 };
  }

  const list = findReviewList(data);
  const pagination = asRecord(data.pagination ?? data.page_info ?? data.meta);
  const totalPages = Math.max(
    1,
    numberValue(
      pagination.total_pages ??
        pagination.totalPages ??
        data.total_pages ??
        data.totalPages ??
        1,
    ),
  );
  return {
    status: "done",
    reviews: list.map(normalizeReview),
    totalPages: Math.min(totalPages, 100),
  };
}

function findReviewList(data: Record<string, unknown>): unknown[] {
  const reviewsObject = asRecord(data.reviews);
  const resultsObject = asRecord(data.results);
  for (const candidate of [
    data.reviews,
    reviewsObject.data,
    reviewsObject.items,
    data.items,
    data.results,
    resultsObject.data,
    resultsObject.items,
    data.list,
    asRecord(data.data).reviews,
    asRecord(data.data).items,
    asRecord(asRecord(data.data).reviews).data,
    asRecord(asRecord(data.data).reviews).items,
    data.data,
  ]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function normalizeReview(value: unknown): ReviewItem {
  const row = asRecord(value);
  const images = Array.isArray(row.images)
    ? row.images.map(stringValue).filter(Boolean)
    : [];
  return {
    asin: stringValue(row.asin),
    marketplace: stringValue(row.marketplace),
    reviewId: stringValue(row.review_id ?? row.reviewId ?? row.id),
    userName: stringValue(row.user_name ?? row.userName),
    rating: numberValue(row.rating),
    title: stringValue(row.title),
    reviewDate: stringValue(row.review_date ?? row.reviewDate),
    reviewContent: stringValue(row.review_content ?? row.reviewContent ?? row.content),
    verifiedPurchase: numberValue(row.verified_purchase ?? row.verifiedPurchase),
    helpfulVotes: numberValue(row.helpful_votes ?? row.helpfulVotes),
    productVariant: stringValue(row.product_variant ?? row.productVariant),
    images,
    page: numberValue(row.page),
  };
}

function dedupeReviews(reviews: ReviewItem[]): ReviewItem[] {
  const seen = new Set<string>();
  return reviews.filter((review) => {
    const key =
      review.reviewId ||
      `${review.asin}|${review.userName}|${review.reviewDate}|${review.title}|${review.reviewContent}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value);
}

function numberValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
