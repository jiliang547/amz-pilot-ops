"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type UsageDay = {
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type UsageData = {
  timezone: string;
  today: UsageDay;
  days: UsageDay[];
  providerReportedCount: number;
  estimatedCount: number;
};

const numberFormatter = new Intl.NumberFormat("zh-CN");

function compactTokens(value: number): string {
  if (value < 10_000) return numberFormatter.format(value);
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

function shortDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function UsageChart({ days }: { days: UsageDay[] }) {
  const width = 620;
  const height = 220;
  const margin = { top: 18, right: 18, bottom: 38, left: 52 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(...days.map((day) => day.totalTokens), 1);
  const points = days.map((day, index) => ({
    x: margin.left + (chartWidth * index) / Math.max(days.length - 1, 1),
    y: margin.top + chartHeight * (1 - day.totalTokens / maxValue),
    day,
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${margin.left},${margin.top + chartHeight} ${line} ${margin.left + chartWidth},${margin.top + chartHeight}`;

  return (
    <div className="token-chart" aria-label="近 7 天 Token 总用量折线图">
      <svg
        className="token-chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
      >
        {[0, 0.5, 1].map((ratio) => {
          const y = margin.top + chartHeight * ratio;
          const value = Math.round(maxValue * (1 - ratio));
          return (
            <g key={ratio}>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={y}
                y2={y}
                className="token-grid-line"
              />
              <text
                x={margin.left - 9}
                y={y + 4}
                textAnchor="end"
                className="token-axis-label"
              >
                {compactTokens(value)}
              </text>
            </g>
          );
        })}
        <polygon points={area} className="token-area" />
        <polyline points={line} className="token-line" />
        {points.map(({ x, y, day }) => (
          <g key={day.date}>
            <circle cx={x} cy={y} r="4" className="token-point">
              <title>{`${day.date}: ${numberFormatter.format(day.totalTokens)} Token`}</title>
            </circle>
            <text
              x={x}
              y={height - 12}
              textAnchor="middle"
              className="token-axis-label"
            >
              {shortDate(day.date)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function TokenUsageButton() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/token-usage", { cache: "no-store" });
      const result = (await response.json()) as UsageData & { error?: string };
      if (!response.ok) throw new Error(result.error || "读取失败");
      setData(result);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const today = data?.today;
  const total = useMemo(() => today?.totalTokens ?? 0, [today]);

  return (
    <>
      <button
        type="button"
        className="token-pill"
        onClick={() => {
          setOpen(true);
          void load();
        }}
        aria-label="查看 Token 用量"
      >
        <span className="token-pill-title">今日 Token</span>
        <span className="token-pill-metric token-upload">
          ↑ {compactTokens(today?.inputTokens ?? 0)}
        </span>
        <span className="token-pill-metric token-download">
          ↓ {compactTokens(today?.outputTokens ?? 0)}
        </span>
        <strong>{loading && !data ? "..." : compactTokens(total)}</strong>
      </button>
      {open && (
        <div
          className="modal-backdrop token-usage-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setOpen(false)
          }
        >
          <section
            className="token-usage-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="token-usage-title"
          >
            <div className="token-modal-head">
              <div>
                <span>北京时间</span>
                <h2 id="token-usage-title">Token 用量</h2>
              </div>
              <button
                type="button"
                className="token-modal-close"
                onClick={() => setOpen(false)}
                aria-label="关闭 Token 用量"
                title="关闭"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            {error && !data ? (
              <div className="token-error">
                <p>{error}</p>
                <button type="button" onClick={() => void load()}>
                  重新加载
                </button>
              </div>
            ) : data ? (
              <>
                <div className="token-summary-grid">
                  <div>
                    <span>今日上传（输入）</span>
                    <strong>
                      {numberFormatter.format(data.today.inputTokens)}
                    </strong>
                  </div>
                  <div>
                    <span>今日下载（输出）</span>
                    <strong>
                      {numberFormatter.format(data.today.outputTokens)}
                    </strong>
                  </div>
                  <div>
                    <span>今日总量</span>
                    <strong>
                      {numberFormatter.format(data.today.totalTokens)}
                    </strong>
                  </div>
                </div>
                <div className="token-chart-head">
                  <div>
                    <h3>近 7 天总用量</h3>
                    <p>每日上传与下载 Token 之和</p>
                  </div>
                  {loading && <span>更新中</span>}
                </div>
                <UsageChart days={data.days} />
                <div className="token-day-list">
                  {data.days.map((day) => (
                    <div key={day.date}>
                      <time>{day.date}</time>
                      <span>
                        上传 {numberFormatter.format(day.inputTokens)}
                      </span>
                      <span>
                        下载 {numberFormatter.format(day.outputTokens)}
                      </span>
                      <strong>{numberFormatter.format(day.totalTokens)}</strong>
                    </div>
                  ))}
                </div>
                {data.estimatedCount > 0 && (
                  <p className="token-note">
                    部分模型未返回精确用量，系统已按文本内容估算。
                  </p>
                )}
              </>
            ) : (
              <div className="token-loading">正在读取用量...</div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
