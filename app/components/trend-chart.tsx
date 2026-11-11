"use client";

import { useMemo, useState } from "react";
import type { ObservationRow } from "@/lib/observations";
import {
  DEFAULT_TREND_METRICS,
  TREND_METRICS,
  pathFor,
  seriesValues,
  toggleMetric,
  type TrendMetric,
} from "@/lib/trend";

const WIDTH = 720;
const HEIGHT = 200;
const PAD = 32;

const SERIES_STYLE: Record<
  "anqi" | "huangcancan",
  Record<TrendMetric, { stroke: string; dash: string; width: number }>
> = {
  huangcancan: {
    total: { stroke: "#f9a8d4", dash: "", width: 2.5 },
    aiLizhi: { stroke: "#fb7185", dash: "7 4", width: 2 },
    kugou: { stroke: "#f472b6", dash: "2 4", width: 2 },
    qqMusic: { stroke: "#e879f9", dash: "10 3 2 3", width: 2 },
  },
  anqi: {
    total: { stroke: "#7dd3fc", dash: "", width: 2.5 },
    aiLizhi: { stroke: "#38bdf8", dash: "7 4", width: 2 },
    kugou: { stroke: "#22d3ee", dash: "2 4", width: 2 },
    qqMusic: { stroke: "#a5f3fc", dash: "10 3 2 3", width: 2 },
  },
};

export function TrendChart({ observations }: { observations: ObservationRow[] }) {
  const [selected, setSelected] = useState<TrendMetric[]>(DEFAULT_TREND_METRICS);
  const chronological = useMemo(() => [...observations].reverse(), [observations]);
  const n = Math.max(1, chronological.length);

  const lines = useMemo(() => {
    const artists = ["huangcancan", "anqi"] as const;
    const built = artists.flatMap((artist) =>
      selected.map((metric) => ({
        artist,
        metric,
        values: seriesValues(chronological, artist, metric),
        style: SERIES_STYLE[artist][metric],
      })),
    );
    const nums = built.flatMap((line) => line.values).filter((value): value is number => value != null);
    return { built, nums };
  }, [chronological, selected]);

  const labels = [chronological[0], chronological[Math.floor((n - 1) / 2)], chronological[n - 1]]
    .filter(Boolean)
    .map((row) => row.collectedLabel);

  return (
    <figure className="chart">
      <fieldset className="metric-toggles">
        <legend>趋势指标</legend>
        {TREND_METRICS.map((metric) => {
          const checked = selected.includes(metric.id);
          return (
            <label key={metric.id} className={checked ? "on" : ""}>
              <input
                type="checkbox"
                name="trend-metric"
                value={metric.id}
                checked={checked}
                onChange={() => setSelected((current) => toggleMetric(current, metric.id))}
              />
              {metric.label}
            </label>
          );
        })}
      </fieldset>
      {lines.nums.length === 0 ? (
        <p className="muted">所选指标在这些检查时间上都是缺口，没有可连的点。不会把未采集到画成 0。</p>
      ) : (
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width="100%"
          height={HEIGHT}
          role="img"
          aria-label={`检查时间趋势：${selected.map((id) => TREND_METRICS.find((item) => item.id === id)?.label).join("、")}。横轴为采集观测时间。缺失不连线。`}
        >
          {(() => {
            const min = Math.min(...lines.nums);
            const max = Math.max(...lines.nums);
            const span = Math.max(1, max - min);
            return (
              <>
                <text x={4} y={PAD} fill="#8aa0b3" fontSize="11">
                  {max.toLocaleString("zh-CN")}
                </text>
                <text x={4} y={HEIGHT - PAD + 4} fill="#8aa0b3" fontSize="11">
                  {min.toLocaleString("zh-CN")}
                </text>
                {lines.built.map((line) => (
                  <path
                    key={`${line.artist}-${line.metric}`}
                    d={pathFor(line.values, min, span, n, WIDTH, HEIGHT, PAD)}
                    fill="none"
                    stroke={line.style.stroke}
                    strokeWidth={line.style.width}
                    strokeDasharray={line.style.dash || undefined}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}
                {chronological.map((row, index) => {
                  const x = PAD + (n <= 1 ? 0 : (index / (n - 1)) * (WIDTH - 2 * PAD));
                  return lines.built.map((line) => {
                    const value = line.values[index];
                    if (value == null) return null;
                    const y = PAD + (1 - (value - min) / span) * (HEIGHT - 2 * PAD);
                    return (
                      <circle
                        key={`${row.collectedAt}-${line.artist}-${line.metric}`}
                        cx={x}
                        cy={y}
                        r="3"
                        fill={line.style.stroke}
                      />
                    );
                  });
                })}
              </>
            );
          })()}
        </svg>
      )}
      <figcaption className="muted">
        粉系=黄灿灿，青系=安崎。实线=实际总票，虚线=爱荔枝，点线=酷狗，点划线=QQ音乐。横轴是检查/采集时间（约每 2
        分钟），不是源站更新时间。源未更新时保留该轮 rawExcerpt 实读票数并标明源时间。null 不画成 0。默认勾选实际总票。
        {labels.length ? ` 范围 ${labels[0]} → ${labels[labels.length - 1]}。` : ""}
      </figcaption>
    </figure>
  );
}
