import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { HistorySnapshot } from "../lib/history";
import type { ObservationRow } from "../lib/observations";
import { metricValue, pathFor, seriesValues, toggleMetric } from "../lib/trend";

function snap(partial: Partial<HistorySnapshot> & Pick<HistorySnapshot, "id" | "artistId" | "sourceDisplayedUpdatedAt">): HistorySnapshot {
  return {
    total: null,
    rank: null,
    platforms: { aiLizhi: null, kugou: null, qqMusic: null },
    collectedAt: null,
    origin: "public_html",
    liveCollector: true,
    provenance: { observer: null, notes: null, rawExcerpt: null, sourceId: null },
    ...partial,
  };
}

describe("selectable trend metrics", () => {
  it("reads total and platform fields and keeps null as a gap, never 0", () => {
    const present = snap({
      id: "a",
      artistId: "anqi",
      sourceDisplayedUpdatedAt: "2026-11-09T08:40:00.000Z",
      total: 24361,
      platforms: { aiLizhi: 7214, kugou: 4740, qqMusic: 12407 },
    });
    const missing = snap({
      id: "h",
      artistId: "huangcancan",
      sourceDisplayedUpdatedAt: "2026-11-09T08:40:00.000Z",
      total: 49738,
      platforms: { aiLizhi: null, kugou: null, qqMusic: null },
    });
    assert.equal(metricValue(present, "total"), 24361);
    assert.equal(metricValue(present, "aiLizhi"), 7214);
    assert.equal(metricValue(missing, "aiLizhi"), null);
    assert.equal(metricValue(null, "kugou"), null);
  });

  it("breaks the SVG path at nulls instead of plotting 0", () => {
    const path = pathFor([10, null, 30], 10, 20, 3, 100, 40, 0);
    assert.equal(path.includes("M"), true);
    assert.equal(/L0\.0/.test(path), false);
    assert.match(path, /^M0\.0 40\.0M100\.0 0\.0$/);
  });

  it("defaults to total and will not allow an empty selection", () => {
    assert.deepEqual(toggleMetric(["total"], "total"), ["total"]);
    assert.deepEqual(toggleMetric(["total"], "aiLizhi"), ["total", "aiLizhi"]);
    assert.deepEqual(toggleMetric(["total", "aiLizhi"], "total"), ["aiLizhi"]);
  });

  it("does not stitch 安崎爱荔枝 onto a 黄灿灿-only source time", () => {
    const timeline: ObservationRow[] = [
      {
        collectedAt: "2026-11-09T08:55:01.000Z",
        collectedLabel: "16:55",
        sourceDisplayedUpdatedAt: "2026-11-09T08:50:00.000Z",
        sourceLabel: "16:50",
        sourceUnchanged: false,
        anqi: null,
        huangcancan: snap({
          id: "h",
          artistId: "huangcancan",
          sourceDisplayedUpdatedAt: "2026-11-09T08:50:00.000Z",
          collectedAt: "2026-11-09T08:55:01.000Z",
          total: 50372,
          platforms: { aiLizhi: 23289, kugou: 8076, qqMusic: 19007 },
        }),
      },
    ];
    assert.deepEqual(seriesValues(timeline, "anqi", "aiLizhi"), [null]);
    assert.deepEqual(seriesValues(timeline, "huangcancan", "aiLizhi"), [23289]);
    assert.deepEqual(seriesValues(timeline, "anqi", "total"), [null]);
  });
});
