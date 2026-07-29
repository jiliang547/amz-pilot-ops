import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("persists three kinds of configurable-model 15-day anomaly analyses", () => {
  const source = read("lib/anomaly-analysis.ts");
  assert.match(source, /"campaign", "keyword", "searchTerm"/);
  assert.match(source, /modelConfigForUser\(userId\)/);
  assert.doesNotMatch(source, /modelName: "mimo-v2\.5"/);
  assert.match(source, /shiftDate\(endDate, -14\)/);
  assert.match(source, /ad_anomaly_analyses/);
  assert.match(source, /这是亚马逊\$\{LABELS\[kind\]\}的广告报告，请帮我分析其中是否有数据异常以及异常的原因/);
  assert.match(source, /objectName/);
  assert.match(source, /reason/);
});

test("forces 90-day initialization and follows with analysis", () => {
  const snapshots = read("lib/snapshot-reports.ts");
  const route = read("app/api/internal/initialize/route.ts");
  assert.match(snapshots, /forceInitial/);
  assert.match(snapshots, /runAnomalyAnalysis/);
  assert.match(route, /forceInitial: true/);
  assert.match(route, /coverage/);
});

test("dashboard exposes dated three-column anomaly history", () => {
  const page = read("app/page.tsx");
  const view = read("app/dashboard-view.tsx");
  const component = read("app/anomaly-history.tsx");
  assert.match(view, /AnomalyHistory/);
  assert.match(view, /数据分析/);
  assert.match(component, /广告活动 \/ 广告组异常/);
  assert.match(component, /投放词异常/);
  assert.match(component, /客户搜索词异常/);
  assert.match(component, /查看时间/);
});
