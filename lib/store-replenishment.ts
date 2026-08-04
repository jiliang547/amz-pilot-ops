import { SpApiClient, loadSpApiConnection } from "./sp-api";

export type ReplenishmentRow = {
  sku: string;
  asin: string;
  productName: string;
  inventory: number;
  sales7: number;
  sales30: number;
  dailySales: number;
  targetInventory: number;
  recommendedReplenishment: number;
};

type StatusCallback = (text: string) => void;

function tsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split("\t").map(item => item.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const values = line.split("\t");
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""]));
  });
}

async function reportText(client: SpApiClient, reportType: string, marketplaceId: string, range?: { start: string; end: string }, status: StatusCallback = () => {}) {
  status(`正在创建 ${reportType} 报表`);
  const created = await client.request("POST", "/reports/2021-06-30/reports", {
    body: {
      reportType,
      marketplaceIds: [marketplaceId],
      ...(range ? { dataStartTime: range.start, dataEndTime: range.end } : {}),
    },
  });
  const reportId = created?.reportId;
  if (!reportId) throw new Error(`${reportType} 未返回 reportId`);
  const deadline = Date.now() + 110_000;
  let report: any;
  while (Date.now() < deadline) {
    report = await client.request("GET", `/reports/2021-06-30/reports/${encodeURIComponent(reportId)}`);
    status(`${reportType}：${report?.processingStatus ?? "排队中"}`);
    if (report?.processingStatus === "DONE") break;
    if (["FATAL", "CANCELLED"].includes(report?.processingStatus)) throw new Error(`${reportType} 生成失败：${report.processingStatus}`);
    await new Promise(resolve => setTimeout(resolve, 2200));
  }
  if (report?.processingStatus !== "DONE" || !report.reportDocumentId) throw new Error(`${reportType} 在等待时间内未生成完成`);
  const document = await client.request("GET", `/reports/2021-06-30/documents/${encodeURIComponent(report.reportDocumentId)}`);
  if (!document?.url) throw new Error(`${reportType} 未返回下载地址`);
  const response = await fetch(document.url);
  if (!response.ok) throw new Error(`${reportType} 下载失败 (${response.status})`);
  let bytes = await response.arrayBuffer();
  if (document.compressionAlgorithm === "GZIP") {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    bytes = await new Response(stream).arrayBuffer();
  }
  return new TextDecoder("utf-8").decode(bytes);
}

export function calculateReplenishment(inventoryRows: Record<string, string>[], orderRows: Record<string, string>[], now = Date.now()): ReplenishmentRow[] {
  const products = new Map<string, { sku: string; asin: string; productName: string; inventory: number; sales7: number; sales30: number }>();
  for (const row of inventoryRows) {
    const sku = (row["seller-sku"] ?? row.sku ?? "").trim();
    if (!sku) continue;
    const fulfillment = String(row["fulfillment-channel"] ?? "").toLowerCase();
    if (fulfillment && !fulfillment.includes("amazon") && !fulfillment.includes("afn")) continue;
    const key = sku.toLowerCase();
    const current = products.get(key) ?? { sku, asin: "", productName: "", inventory: 0, sales7: 0, sales30: 0 };
    current.asin ||= row.asin ?? row.asin1 ?? "";
    current.productName ||= row["product-name"] ?? row["item-name"] ?? "";
    current.inventory += Math.max(0, Number(row["quantity available"] ?? row["afn-fulfillable-quantity"] ?? row.quantity ?? 0) || 0);
    products.set(key, current);
  }
  const sevenDaysAgo = now - 7 * 86400_000;
  const thirtyDaysAgo = now - 30 * 86400_000;
  for (const row of orderRows) {
    const sku = (row.sku ?? row["seller-sku"] ?? "").trim();
    const status = `${row["order-status"] ?? ""} ${row["item-status"] ?? ""}`.toLowerCase();
    const purchasedAt = Date.parse(row["purchase-date"] ?? "");
    const quantity = Math.max(0, Number(row.quantity ?? 0) || 0);
    if (!sku || !quantity || status.includes("cancel") || !Number.isFinite(purchasedAt) || purchasedAt < thirtyDaysAgo || purchasedAt > now) continue;
    const key = sku.toLowerCase();
    const current = products.get(key) ?? { sku, asin: "", productName: "", inventory: 0, sales7: 0, sales30: 0 };
    current.asin ||= row.asin ?? "";
    current.productName ||= row["product-name"] ?? "";
    current.sales30 += quantity;
    if (purchasedAt >= sevenDaysAgo) current.sales7 += quantity;
    products.set(key, current);
  }
  return [...products.values()].map(item => {
    const dailySales = (item.sales7 / 7 + item.sales30 / 30) / 2;
    const targetInventory = Math.ceil(dailySales * 150);
    return {
      ...item,
      dailySales: Number(dailySales.toFixed(3)),
      targetInventory,
      recommendedReplenishment: Math.max(0, targetInventory - item.inventory),
    };
  }).sort((a, b) => b.recommendedReplenishment - a.recommendedReplenishment || b.sales30 - a.sales30 || a.sku.localeCompare(b.sku));
}

export async function getReplenishmentSnapshot(userId: string, status: StatusCallback = () => {}) {
  const connection = await loadSpApiConnection(userId);
  const client = new SpApiClient(connection);
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 86400_000);
  status(`已连接 ${connection.marketplaceName}，正在读取库存和近 30 天订单`);
  const inventoryPromise = (async () => {
    const reportTypes = ["GET_AFN_INVENTORY_DATA", "GET_FBA_MYI_ALL_INVENTORY_DATA", "GET_MERCHANT_LISTINGS_ALL_DATA"];
    const errors: string[] = [];
    for (const reportType of reportTypes) {
      try {
        return await reportText(client, reportType, connection.marketplaceId, undefined, status);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        errors.push(detail);
        status(`${reportType} 不可用，正在自动切换备用库存报表`);
      }
    }
    throw new Error(`全部库存报表均不可用：${errors.join("；")}`);
  })();
  const [inventoryText, ordersText] = await Promise.all([
    inventoryPromise,
    reportText(client, "GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL", connection.marketplaceId, { start: start.toISOString(), end: end.toISOString() }, status),
  ]);
  status("正在按 SKU 计算 7 天、30 天销量和 150 天补货量");
  const rows = calculateReplenishment(tsv(inventoryText), tsv(ordersText), end.getTime());
  return {
    generatedAt: end.toISOString(),
    marketplace: { id: connection.marketplaceId, name: connection.marketplaceName, countryCode: connection.countryCode },
    formula: "日销量 = ((7天销量 ÷ 7) + (30天销量 ÷ 30)) ÷ 2；建议补货 = max(0, ceil(日销量 × 150) - 当前库存)",
    totals: {
      skuCount: rows.length,
      inventory: rows.reduce((sum, row) => sum + row.inventory, 0),
      sales7: rows.reduce((sum, row) => sum + row.sales7, 0),
      sales30: rows.reduce((sum, row) => sum + row.sales30, 0),
      recommendedReplenishment: rows.reduce((sum, row) => sum + row.recommendedReplenishment, 0),
    },
    rows,
  };
}
