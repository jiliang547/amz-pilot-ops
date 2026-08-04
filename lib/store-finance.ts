import { SpApiClient, type SpApiConnection } from "./sp-api";

type Money = { currencyCode?: string; currencyAmount?: number | string; amount?: number | string; value?: number | string };

function amountOf(transaction: any): { value: number; currencyCode: string } | null {
  const raw = transaction?.totalAmount ?? transaction?.transactionAmount ?? transaction?.amount ?? transaction?.total;
  const money: Money = raw && typeof raw === "object" ? raw : { value: raw };
  const value = Number(money.currencyAmount ?? money.amount ?? money.value);
  return Number.isFinite(value) ? { value, currencyCode: String(money.currencyCode ?? transaction?.currencyCode ?? "UNKNOWN") } : null;
}

function transactionId(transaction: any, index: number) {
  return String(transaction?.transactionId ?? transaction?.id ?? `${transaction?.transactionPostedDate ?? "unknown"}:${index}`);
}

export async function getFinancialSummary(
  connection: SpApiConnection,
  input: { startDate: string; endDate: string; transactionStatus?: "RELEASED" | "DEFERRED_RELEASED" },
) {
  const start = new Date(input.startDate);
  const end = new Date(input.endDate);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    throw new Error("Finance query date range is invalid; use YYYY-MM-DD");
  }
  if (end.getTime() - start.getTime() > 180 * 24 * 60 * 60 * 1000) {
    throw new Error("Amazon Finances API supports at most 180 days per query");
  }
  if (end.getTime() > Date.now() - 2 * 60 * 1000) {
    throw new Error("Amazon requires postedBefore to be at least 2 minutes before now");
  }

  const client = new SpApiClient(connection);
  const statuses = input.transactionStatus ? [input.transactionStatus] : ["RELEASED", "DEFERRED_RELEASED"] as const;
  const all = new Map<string, any>();
  for (const status of statuses) {
    let nextToken: string | undefined;
    for (let page = 0; page < 100; page++) {
      const query: Record<string, unknown> = nextToken
        ? { nextToken }
        : { postedAfter: start.toISOString(), postedBefore: end.toISOString(), marketplaceId: connection.marketplaceId, transactionStatus: status };
      const response = await client.request("GET", "/finances/2024-06-19/transactions", { query });
      const payload = response?.payload ?? response ?? {};
      const transactions = Array.isArray(payload.transactions) ? payload.transactions : [];
      transactions.forEach((item: any, index: number) => all.set(transactionId(item, index), item));
      nextToken = payload.nextToken;
      if (!nextToken || transactions.length === 0) break;
    }
  }

  const totals = new Map<string, number>();
  const types = new Map<string, number>();
  let unparsedAmountCount = 0;
  for (const transaction of all.values()) {
    const money = amountOf(transaction);
    if (!money) { unparsedAmountCount++; continue; }
    totals.set(money.currencyCode, (totals.get(money.currencyCode) ?? 0) + money.value);
    const type = String(transaction.transactionType ?? transaction.type ?? "UNKNOWN");
    types.set(type, (types.get(type) ?? 0) + 1);
  }

  return {
    period: { startDate: input.startDate, endDate: input.endDate },
    marketplaceId: connection.marketplaceId,
    definition: "Amazon Finances API net amount for RELEASED/DEFERRED_RELEASED transactions; this is not accounting profit after COGS and ad costs.",
    transactionCount: all.size,
    amounts: [...totals.entries()].map(([currencyCode, totalAmount]) => ({ currencyCode, totalAmount: Number(totalAmount.toFixed(2)) })),
    transactionTypes: [...types.entries()].map(([transactionType, count]) => ({ transactionType, count })),
    unparsedAmountCount,
  };
}
