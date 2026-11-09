import type { ObservationArtist, ObservationRow } from "./observations";

export type TrendMetric = "total" | "aiLizhi" | "kugou" | "qqMusic";

export const TREND_METRICS: Array<{ id: TrendMetric; label: string }> = [
  { id: "total", label: "实际总票" },
  { id: "aiLizhi", label: "爱荔枝" },
  { id: "kugou", label: "酷狗" },
  { id: "qqMusic", label: "QQ音乐" },
];

export const DEFAULT_TREND_METRICS: TrendMetric[] = ["total"];

export function metricValue(snapshot: ObservationArtist | null | undefined, metric: TrendMetric): number | null {
  if (!snapshot) return null;
  if (metric === "total") {
    return typeof snapshot.total === "number" ? snapshot.total : null;
  }
  const value = snapshot.platforms[metric];
  return typeof value === "number" ? value : null;
}

export function seriesValues(timeline: ObservationRow[], artist: "anqi" | "huangcancan", metric: TrendMetric): Array<number | null> {
  return timeline.map((row) => metricValue(row[artist], metric));
}

export function toggleMetric(selected: TrendMetric[], metric: TrendMetric): TrendMetric[] {
  if (selected.includes(metric)) {
    const next = selected.filter((item) => item !== metric);
    return next.length > 0 ? next : ["total"];
  }
  return [...TREND_METRICS.map((item) => item.id).filter((id) => selected.includes(id) || id === metric)];
}

export function pathFor(values: Array<number | null>, min: number, span: number, n: number, width: number, height: number, pad: number): string {
  let d = "";
  let drawing = false;
  values.forEach((value, index) => {
    if (value == null) {
      drawing = false;
      return;
    }
    const x = pad + (n <= 1 ? 0 : (index / (n - 1)) * (width - 2 * pad));
    const y = pad + (1 - (value - min) / span) * (height - 2 * pad);
    d += `${drawing ? " L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    drawing = true;
  });
  return d;
}
