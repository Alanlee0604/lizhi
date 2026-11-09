import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildHistoryPayload,
  buildTimeline,
  cellOrGap,
  displayCount,
  originLabel,
  platformCell,
  type HistorySnapshot,
} from "../lib/history";

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

describe("history display", () => {
  it("shows 未提供 for null counts and never turns missing platforms into 0", () => {
    assert.equal(displayCount(null), "未提供");
    assert.equal(displayCount(16558), "16,558");
    assert.equal(originLabel("historical_observation", false), "历史人工观测（非实时）");
    assert.equal(originLabel("public_html", true), "公开 HTML");
  });

  it("keeps a missing artist at a source time as 缺口 instead of stitching the other artist", () => {
    const rows = buildTimeline([
      snap({
        id: "h",
        artistId: "huangcancan",
        sourceDisplayedUpdatedAt: "2026-11-09T08:50:00.000Z",
        total: 50372,
        rank: 1,
      }),
      snap({
        id: "a",
        artistId: "anqi",
        sourceDisplayedUpdatedAt: "2026-11-09T09:20:00.000Z",
        total: 25628,
        rank: 2,
        platforms: { aiLizhi: 1, kugou: null, qqMusic: null },
      }),
    ]);
    assert.equal(rows.length, 2);
    const later = rows.find((row) => row.sourceDisplayedUpdatedAt.endsWith("09:20:00.000Z"));
    const earlier = rows.find((row) => row.sourceDisplayedUpdatedAt.endsWith("08:50:00.000Z"));
    assert.equal(cellOrGap(later?.anqi || null, "total"), "25,628");
    assert.equal(cellOrGap(later?.huangcancan || null, "total"), "缺口");
    assert.equal(platformCell(later?.anqi || null, "kugou"), "未提供");
    assert.equal(cellOrGap(earlier?.huangcancan || null, "total"), "50,372");
    assert.equal(cellOrGap(earlier?.anqi || null, "total"), "缺口");
  });

  it("preserves historical_observation snapshots from the shared state payload", () => {
    const payload = buildHistoryPayload({
      timezone: "Asia/Shanghai",
      edition: { show: "打歌2026·X舞台", zone: "鲜打专区", term: "第9期" },
      views: {},
      snapshots: [
        {
          id: "hist-anqi-xstage-2026-11-09-1410",
          artistId: "anqi",
          total: 16558,
          rank: 2,
          platforms: { aiLizhi: 6340, kugou: 2831, qqMusic: 7387 },
          sourceDisplayedUpdatedAt: "2026-11-09T06:10:00.000Z",
          collectedAt: "2026-11-09T06:15:00.000Z",
          origin: "historical_observation",
          liveCollector: false,
          provenance: { observer: "parent_browser_initial", sourceId: "anqi-b40cE93Aqkgo" },
        },
        {
          id: "hist-cancan",
          artistId: "huangcancan",
          total: 40799,
          rank: 1,
          platforms: { aiLizhi: null, kugou: null, qqMusic: null },
          sourceDisplayedUpdatedAt: "2026-11-09T06:10:00.000Z",
          collectedAt: "2026-11-09T06:16:00.000Z",
          origin: "historical_observation",
          liveCollector: false,
          provenance: { observer: "parent_browser_yobang" },
        },
      ],
    });
    assert.equal(payload.architecture.migrated, false);
    assert.equal(payload.counts.snapshots, 2);
    assert.equal(payload.timeline[0]?.anqi?.total, 16558);
    assert.equal(payload.timeline[0]?.huangcancan?.platforms.aiLizhi, null);
    assert.equal(originLabel(payload.timeline[0]?.anqi?.origin, payload.timeline[0]?.anqi?.liveCollector), "历史人工观测（非实时）");
  });
});
