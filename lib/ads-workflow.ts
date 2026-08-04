export type WorkflowAction = { toolName: string; args: Record<string, unknown> };

export type ReportGroup = {
  dimension: "campaign" | "adGroup" | "keyword" | "searchTerm" | "ad" | "product";
  label: string;
  secondary?: string;
  campaignId?: string;
  campaignName?: string;
  adGroupId?: string;
  adGroupName?: string;
  targetId?: string;
  adId?: string;
  aggregates: Record<string, number>;
  metrics: Record<string, number>;
};

type ReportSummary = {
  rowCount: number;
  columns: string[];
  aggregates: Record<string, number>;
  groups: ReportGroup[];
  dimensions: Record<string, ReportGroup[]>;
};

const METRICS: Record<string, string[]> = {
  totalCost: ["metric.totalcost", "totalcost", "spend", "cost"],
  sales: ["metric.sales", "sales"],
  clicks: ["metric.clicks", "clicks"],
  impressions: ["metric.impressions", "impressions"],
  purchases: ["metric.purchases", "purchases", "orders"],
  unitsSold: ["metric.unitssold", "unitssold"],
};

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = "", quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index++; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { cells.push(value); value = ""; }
    else value += character;
  }
  cells.push(value);
  return cells;
}

function normalizedHeader(value: string): string {
  return value.toLowerCase().replace(/[\s_]/g, "");
}

function findColumn(headers: string[], names: string[]): number {
  return headers.findIndex(header => names.some(name => header === name || header.endsWith(name)));
}

function numeric(value: string | undefined): number {
  const parsed = Number((value ?? "").replace(/[$€£¥%\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculated(aggregates: Record<string, number>): Record<string, number> {
  const cost = aggregates.totalCost ?? 0, sales = aggregates.sales ?? 0;
  const clicks = aggregates.clicks ?? 0, impressions = aggregates.impressions ?? 0;
  const purchases = aggregates.purchases ?? 0;
  return {
    acos: sales > 0 ? cost / sales * 100 : 0,
    roas: cost > 0 ? sales / cost : 0,
    ctr: impressions > 0 ? clicks / impressions * 100 : 0,
    conversionRate: clicks > 0 ? purchases / clicks * 100 : 0,
  };
}

function relevantGroups(groups: ReportGroup[], queryText: string): ReportGroup[] {
  const selected = new Map<string, ReportGroup>();
  const add = (group: ReportGroup) => selected.set(`${group.dimension}:${group.label}:${group.secondary ?? ""}`, group);
  const query = queryText.toLocaleLowerCase();
  for (const group of groups) {
    const label = group.label.toLocaleLowerCase();
    const secondary = group.secondary?.toLocaleLowerCase() ?? "";
    if ((label.length >= 3 && query.includes(label)) || (secondary.length >= 3 && query.includes(secondary))) add(group);
  }
  const rankers: Array<(group: ReportGroup) => number> = [
    group => group.aggregates.totalCost ?? 0,
    group => group.aggregates.sales ?? 0,
    group => group.aggregates.clicks ?? 0,
    group => group.aggregates.purchases ?? 0,
    group => group.metrics.acos ?? 0,
    group => group.metrics.roas ?? 0,
  ];
  for (const rank of rankers) for (const group of [...groups].sort((a, b) => rank(b) - rank(a)).slice(0, 20)) add(group);
  return [...selected.values()].slice(0, 120);
}

export function summarizeAdsCsv(csv: string, queryText = ""): ReportSummary {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { rowCount: 0, columns: [], aggregates: {}, groups: [], dimensions: {} };
  const columns = parseCsvLine(lines[0]);
  const headers = columns.map(normalizedHeader);
  const metricIndexes = Object.fromEntries(Object.entries(METRICS).map(([key, names]) => [key, findColumn(headers, names)]));
  const index = (names: string[]) => findColumn(headers, names);
  const fields = {
    campaignId: index(["campaign.id", "campaignid"]), campaignName: index(["campaign.name", "campaignname"]),
    adGroupId: index(["adgroup.id", "adgroupid"]), adGroupName: index(["adgroup.name", "adgroupname"]),
    targetId: index(["target.id", "targetid", "keyword.id", "keywordid"]),
    keyword: index(["keyword.value", "keyword", "targetingtext.value", "targetingtext"]),
    matchType: index(["matchtype.value", "matchtype", "keyword.matchtype"]),
    searchTerm: index(["searchterm.value", "searchterm", "customersearchterm"]),
    adId: index(["ad.id", "adid"]), productId: index(["advertisedproduct.id", "advertisedproductid", "asin", "sku"]),
  };
  const aggregate: Record<string, number> = {};
  for (const [key, column] of Object.entries(metricIndexes)) if (column >= 0) aggregate[key] = 0;
  const maps = new Map<ReportGroup["dimension"], Map<string, ReportGroup>>();
  const value = (cells: string[], column: number) => column >= 0 ? cells[column]?.trim() || undefined : undefined;
  const addGroup = (dimension: ReportGroup["dimension"], key: string | undefined, group: Omit<ReportGroup, "dimension" | "aggregates" | "metrics">, rowMetrics: Record<string, number>) => {
    if (!key || !group.label) return;
    const map = maps.get(dimension) ?? new Map<string, ReportGroup>();
    const current = map.get(key) ?? { ...group, dimension, aggregates: {}, metrics: {} };
    for (const [metric, amount] of Object.entries(rowMetrics)) current.aggregates[metric] = (current.aggregates[metric] ?? 0) + amount;
    map.set(key, current); maps.set(dimension, map);
  };
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
    const cells = parseCsvLine(lines[lineIndex]);
    const rowMetrics: Record<string, number> = {};
    for (const [key, column] of Object.entries(metricIndexes)) if (column >= 0) {
      rowMetrics[key] = numeric(cells[column]); aggregate[key] += rowMetrics[key];
    }
    const campaignId = value(cells, fields.campaignId), campaignName = value(cells, fields.campaignName);
    const adGroupId = value(cells, fields.adGroupId), adGroupName = value(cells, fields.adGroupName);
    const targetId = value(cells, fields.targetId), keyword = value(cells, fields.keyword), matchType = value(cells, fields.matchType);
    const searchTerm = value(cells, fields.searchTerm), adId = value(cells, fields.adId), productId = value(cells, fields.productId);
    addGroup("campaign", campaignId || campaignName, { label: campaignName || campaignId || "", campaignId, campaignName }, rowMetrics);
    addGroup("adGroup", adGroupId || adGroupName, { label: adGroupName || adGroupId || "", secondary: campaignName, campaignId, campaignName, adGroupId, adGroupName }, rowMetrics);
    addGroup("keyword", targetId || keyword, { label: keyword || targetId || "", secondary: matchType, campaignId, campaignName, adGroupId, adGroupName, targetId }, rowMetrics);
    addGroup("searchTerm", searchTerm, { label: searchTerm || "", secondary: keyword || adGroupName, campaignId, campaignName, adGroupId, adGroupName, targetId }, rowMetrics);
    addGroup("ad", adId, { label: adId || "", secondary: productId, campaignId, campaignName, adGroupId, adGroupName, adId }, rowMetrics);
    addGroup("product", productId, { label: productId || "", secondary: adGroupName, campaignId, campaignName, adGroupId, adGroupName, adId }, rowMetrics);
  }
  const dimensions: Record<string, ReportGroup[]> = {};
  for (const [dimension, map] of maps) {
    const groups = [...map.values()].map(group => ({ ...group, metrics: calculated(group.aggregates) }));
    dimensions[dimension] = relevantGroups(groups, queryText);
  }
  return { rowCount: Math.max(0, lines.length - 1), columns, aggregates: aggregate, groups: dimensions.campaign ?? [], dimensions };
}

function arrayKeyForTool(toolName: string): string | undefined {
  if (/(?:-|_)(?:create|update)_campaign$/.test(toolName)) return "campaigns";
  if (/(?:-|_)(?:create|update)_ad_group$/.test(toolName)) return "adGroups";
  if (/(?:-|_)(?:create|update)_ad$/.test(toolName)) return "ads";
  if (/(?:-|_)(?:create|update)_target(?:_bid)?$/.test(toolName)) return "targets";
  if (/delete_target$/.test(toolName)) return "targetIds";
  return undefined;
}

export function expandWorkflowActions(actions: WorkflowAction[], maximum = 100): WorkflowAction[] {
  const expanded: WorkflowAction[] = [];
  for (const action of actions) {
    const body = action.args.body && typeof action.args.body === "object" ? action.args.body as Record<string, unknown> : {};
    const key = arrayKeyForTool(action.toolName), items = key && Array.isArray(body[key]) ? body[key] as unknown[] : [];
    if (!key || items.length <= 1) expanded.push(action);
    else for (const item of items) expanded.push({ toolName: action.toolName, args: { ...action.args, body: { ...body, [key]: [item] } } });
    if (expanded.length > maximum) throw new Error(`单次审批最多允许 ${maximum} 条写操作`);
  }
  return expanded;
}
