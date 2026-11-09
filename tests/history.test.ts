import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildHistoryPayload,
  buildTimeline,
  cellOrGap,
  collectionGapsOf,
  displayCount,
  originLabel,
  overlayObservationPlatforms,
  platformCell,
  platformFill,
  resolveStateUrl,
  type HistorySnapshot,
} from "../lib/history";
import { encodeObservationExcerpt } from "../lib/observations";
import { DEFAULT_STATE_URL } from "../lib/targets";

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
  it("shows 未采集到 for null counts and never turns missing platforms into 0", () => {
    assert.equal(displayCount(null), "未采集到");
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
    assert.equal(platformCell(later?.anqi || null, "kugou"), "未采集到");
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
    assert.equal(payload.architecture.corsBrowserDirect, false);
    assert.equal(payload.counts.platformsAllNull, 1);
    assert.equal(payload.counts.platformsAllNumeric, 1);
  });

  it("keeps the 18:01 blocked render as a collection gap, not a vote row", () => {
    const gaps = collectionGapsOf([
      {
        id: "att_gap",
        at: "2026-11-09T10:01:00.000Z",
        kind: "blocked_browser_render",
        message: "已记本地缺口，未用空值或历史票数入库。",
        ingested: false,
      },
      {
        id: "att_ok",
        at: "2026-11-09T10:05:00.000Z",
        kind: "external_browser_bot",
        ingested: true,
        message: "入库",
      },
    ]);
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0]?.ingested, false);
    assert.equal(gaps[0]?.kind, "blocked_browser_render");
  });

  it("overlays this-round obsj platforms onto cards and does not copy historical 三端", () => {
    const payload = buildHistoryPayload({
      timezone: "Asia/Shanghai",
      edition: { show: "打歌2026·X舞台", zone: "鲜打专区", term: "第9期" },
      views: {
        huangcancan: {
          displayName: "黄灿灿",
          songTitle: "早上坏",
          latest: {
            id: "snap-h",
            artistId: "huangcancan",
            total: 58681,
            rank: 1,
            platforms: { aiLizhi: null, kugou: null, qqMusic: null },
            sourceDisplayedUpdatedAt: "2026-11-09T11:30:00.000Z",
            collectedAt: "2026-11-09T11:34:05.250Z",
            origin: "public_html",
            liveCollector: true,
            provenance: { observer: "vercel_function_chromium" },
          },
        },
        anqi: {
          displayName: "安崎",
          songTitle: "Ice In My Walk",
          latest: {
            id: "snap-a",
            artistId: "anqi",
            total: 29009,
            rank: 2,
            platforms: { aiLizhi: 6340, kugou: 2831, qqMusic: 7387 },
            sourceDisplayedUpdatedAt: "2026-11-09T11:30:00.000Z",
            collectedAt: "2026-11-09T11:34:05.250Z",
            origin: "public_html",
            liveCollector: true,
            provenance: { observer: "parent_browser_initial" },
          },
        },
      },
      snapshots: [],
      attempts: [
        {
          id: "h1",
          at: "2026-11-09T11:36:19.928Z",
          rawExcerpt: encodeObservationExcerpt({
            sourceUpdateText: "更新至19:30",
            artist: "黄灿灿",
            title: "早上坏",
            rank: 1,
            total: 58681,
            platforms: { aiLizhi: 24993, kugou: 9267, qqMusic: 24421 },
          }),
        },
        {
          id: "a1",
          at: "2026-11-09T11:36:20.118Z",
          rawExcerpt: encodeObservationExcerpt({
            sourceUpdateText: "更新至19:30",
            artist: "安崎",
            title: "Ice In My Walk",
            rank: 2,
            total: 29009,
            platforms: { aiLizhi: 8129, kugou: 5482, qqMusic: 15398 },
          }),
        },
      ],
    });
    const huang = payload.artists.find((item) => item.artistId === "huangcancan");
    const anqi = payload.artists.find((item) => item.artistId === "anqi");
    assert.equal(huang?.latest?.platforms.aiLizhi, 24993);
    assert.equal(anqi?.latest?.platforms.aiLizhi, 8129);
    assert.notEqual(anqi?.latest?.platforms.aiLizhi, 6340);
    assert.equal(huang?.platformMissReason, null);
    assert.equal(anqi?.platformMissReason, null);
  });

  it("shows a miss reason instead of asserting 腾讯未提供", () => {
    const artist = overlayObservationPlatforms(
      {
        artistId: "anqi",
        displayName: "安崎",
        songTitle: "Ice In My Walk",
        sampleCount: 1,
        latest: snap({
          id: "a",
          artistId: "anqi",
          sourceDisplayedUpdatedAt: "2026-11-09T11:30:00.000Z",
          total: 29009,
        }),
        freshness: null,
        deltas: null,
        platformMissReason: null,
      },
      [],
    );
    assert.equal(artist.platformMissReason, "当前快照没有三端实读记录（不是断言源站未提供）");
    assert.equal(displayCount(artist.latest?.platforms.aiLizhi), "未采集到");
  });

  it("refuses non-https snapshot files as the live source", () => {
    assert.equal(resolveStateUrl(DEFAULT_STATE_URL), DEFAULT_STATE_URL);
    assert.equal(resolveStateUrl("/cursor/stores/bot/xianda/history-export/raw/api-state-latest.json"), null);
  });
});

const AUDIT = "/cursor/stores/bot/xianda/history-export/raw/api-state-latest.json";

describe("audit backup at 18:10 CST (does not replace live fetch)", () => {
  it("matches 29/14/15, six all-null platforms, and keeps 16:50 安崎 as a gap", (t) => {
    if (!existsSync(AUDIT)) {
      t.skip("audit export not mounted");
      return;
    }
    const state = JSON.parse(readFileSync(AUDIT, "utf8")) as unknown;
    const payload = buildHistoryPayload(state, DEFAULT_STATE_URL);
    assert.equal(payload.architecture.migrated, false);
    assert.equal(payload.architecture.source, DEFAULT_STATE_URL);
    assert.equal(payload.counts.snapshots, 29);
    assert.equal(payload.counts.anqi, 14);
    assert.equal(payload.counts.huangcancan, 15);
    assert.equal(payload.counts.sourceTimes, 16);
    assert.equal(payload.counts.platformsAllNumeric, 23);
    assert.equal(payload.counts.platformsAllNull, 6);
    assert.equal(payload.counts.seriesPoints, 16);
    const row1650 = payload.timeline.find((row) => row.sourceDisplayedUpdatedAt === "2026-11-09T08:50:00.000Z");
    assert.equal(cellOrGap(row1650?.anqi || null, "total"), "缺口");
    assert.equal(cellOrGap(row1650?.huangcancan || null, "total"), "50,372");
    const histCancan = payload.snapshots.find((item) => item.id === "hist-cancan-yobang-2026-11-09-1410");
    assert.equal(platformFill(histCancan?.platforms || { aiLizhi: null, kugou: null, qqMusic: null }), "all_null");
  });
});
