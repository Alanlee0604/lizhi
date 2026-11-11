import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildObservationRows,
  encodeObservationExcerpt,
  parseAttemptReading,
} from "../lib/observations";

describe("attempt.rawExcerpt observation axis", () => {
  it("recovers total/rank/source time from a duplicate-200 excerpt and does not invent platforms", () => {
    const reading = parseAttemptReading({
      id: "att_dup_anqi",
      at: "2026-11-09T10:52:21.332Z",
      message: "anqi 已按源站更新时间去重（检查成功，不是新样本）",
      rawExcerpt: "更新至18:40 安崎 Ice In My Walk rank=2 total=27176",
    });
    assert.equal(reading?.artistId, "anqi");
    assert.equal(reading?.total, 27176);
    assert.equal(reading?.rank, 2);
    assert.equal(reading?.sourceDisplayedUpdatedAt, "2026-11-09T18:40:00+08:00");
    assert.equal(reading?.platformsStructured, false);
    assert.equal(reading?.platformMiss, "unstructured_total_only");
    assert.equal(reading?.platforms.aiLizhi, null);
    assert.equal(reading?.platforms.kugou, null);
    assert.equal(reading?.platforms.qqMusic, null);
  });

  it("reads structured platforms only when obsj is present on that round", () => {
    const excerpt = encodeObservationExcerpt({
      sourceUpdateText: "更新至19:20",
      artist: "黄灿灿",
      title: "早上坏",
      rank: 1,
      total: 58133,
      platforms: { aiLizhi: 100, kugou: null, qqMusic: 200 },
    });
    const reading = parseAttemptReading({
      id: "att_new",
      at: "2026-11-09T11:24:05.244Z",
      rawExcerpt: excerpt,
    });
    assert.equal(reading?.platformsStructured, true);
    assert.equal(reading?.platforms.aiLizhi, 100);
    assert.equal(reading?.platforms.kugou, null);
    assert.equal(reading?.platforms.qqMusic, 200);
    assert.equal(reading?.platformMiss, null);
    assert.equal(reading?.total, 58133);
  });

  it("keeps a miss code on structured null platforms instead of inventing 腾讯未提供", () => {
    const excerpt = encodeObservationExcerpt({
      sourceUpdateText: "更新至19:30",
      artist: "安崎",
      title: "Ice In My Walk",
      rank: 2,
      total: 29009,
      platforms: { aiLizhi: null, kugou: null, qqMusic: null },
      miss: "not_attempted_detail",
    });
    const reading = parseAttemptReading({
      id: "att_miss",
      at: "2026-11-09T11:34:05.250Z",
      rawExcerpt: excerpt,
    });
    assert.equal(reading?.platformsStructured, true);
    assert.equal(reading?.platformMiss, "not_attempted_detail");
    assert.equal(reading?.platforms.aiLizhi, null);
  });

  it("keeps two checks with the same source time as two observation points", () => {
    const rows = buildObservationRows([
      {
        id: "a1",
        at: "2026-11-09T10:50:17.354Z",
        rawExcerpt: "更新至18:40 安崎 Ice In My Walk rank=2 total=27176",
      },
      {
        id: "h1",
        at: "2026-11-09T10:50:17.170Z",
        rawExcerpt: "更新至18:40 黄灿灿 早上坏 rank=1 total=55714",
      },
      {
        id: "a2",
        at: "2026-11-09T10:52:21.332Z",
        rawExcerpt: "更新至18:40 安崎 Ice In My Walk rank=2 total=27176",
      },
      {
        id: "h2",
        at: "2026-11-09T10:52:21.152Z",
        rawExcerpt: "更新至18:40 黄灿灿 早上坏 rank=1 total=55714",
      },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.sourceUnchanged, true);
    assert.equal(rows[1]?.sourceUnchanged, false);
    assert.equal(rows[0]?.anqi?.total, 27176);
    assert.equal(rows[0]?.huangcancan?.total, 55714);
    assert.equal(rows[0]?.anqi?.platforms.aiLizhi, null);
    assert.notEqual(rows[0]?.collectedAt, rows[1]?.collectedAt);
  });

  it("does not copy a later snapshot's platforms onto an older check", () => {
    const rows = buildObservationRows([
      {
        id: "old",
        at: "2026-11-09T10:52:21.332Z",
        rawExcerpt: "更新至18:40 安崎 Ice In My Walk rank=2 total=27176",
      },
      {
        id: "newer",
        at: "2026-11-09T10:54:18.000Z",
        rawExcerpt: encodeObservationExcerpt({
          sourceUpdateText: "更新至18:50",
          artist: "安崎",
          title: "Ice In My Walk",
          rank: 2,
          total: 27754,
          platforms: { aiLizhi: 8000, kugou: 5000, qqMusic: 14754 },
        }),
      },
    ]);
    const older = rows.find((row) => row.collectedAt.startsWith("2026-11-09T10:52"));
    const newer = rows.find((row) => row.collectedAt.startsWith("2026-11-09T10:54"));
    assert.equal(older?.anqi?.platforms.aiLizhi, null);
    assert.equal(newer?.anqi?.platforms.aiLizhi, 8000);
  });

  it("skips attempts that have no parseable total instead of filling from neighbors", () => {
    const rows = buildObservationRows([
      {
        id: "empty",
        at: "2026-11-09T10:40:17.192Z",
        message: "huangcancan 已按源站更新时间去重（检查成功，不是新样本）",
        rawExcerpt: "no votes here",
      },
    ]);
    assert.equal(rows.length, 0);
  });
});
