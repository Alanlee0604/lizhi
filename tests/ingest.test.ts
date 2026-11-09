import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildIngestRecords } from "../lib/ingest";
import { retryAfterSeconds } from "../lib/limits";
import { combineShanghaiClock } from "../lib/source-time";
import type { ProbeSuccess } from "../lib/types";

function sample(): ProbeSuccess {
  return {
    ok: true,
    layer: "vercel-function-chromium",
    chartTitle: "打歌2026·X舞台",
    period: "第9期",
    zoneName: "鲜打专区",
    sourceUrl: "https://example.invalid",
    finalUrl: "https://example.invalid/chart",
    sourceUpdateText: "更新至17:10",
    collectedAtUtc: "2026-11-09T09:14:31.826Z",
    collectedAtBeijing: "2026/11/09 17:14:31",
    songs: [
      {
        id: "huangcancan-zaoshanghuai",
        artistId: "huangcancan",
        artist: "黄灿灿",
        title: "早上坏",
        found: true,
        rank: 1,
        totalVotes: 51008,
        platforms: { aiLizhi: null, kugou: null, qqMusic: null },
      },
      {
        id: "anqi-ice-in-my-walk",
        artistId: "anqi",
        artist: "安崎",
        title: "Ice In My Walk",
        found: true,
        rank: 2,
        totalVotes: 25457,
        platforms: { aiLizhi: null, kugou: 12, qqMusic: null },
      },
    ],
    restriction: null,
    screenshotJpegBase64: "should-not-be-ingested",
    notes: [],
    rateLimit: { limit: "1/min", retryAfterSeconds: 60 },
    ingest: null,
  };
}

describe("ingest payload", () => {
  it("posts one record per artistId with total, Shanghai source time, and null platforms", () => {
    const records = buildIngestRecords(sample());
    assert.equal(records.length, 2);
    assert.equal(records[0]?.artistId, "huangcancan");
    assert.equal(records[0]?.total, 51008);
    assert.equal(records[0]?.rank, 1);
    assert.equal(records[0]?.sourceDisplayedUpdatedAt, "2026-11-09T17:10:00+08:00");
    assert.equal(records[0]?.collectedAt, "2026-11-09T09:14:31.826Z");
    assert.equal(records[0]?.origin, "public_html");
    assert.equal(records[0]?.liveCollector, true);
    assert.equal(records[0]?.observer, "vercel_function_chromium");
    assert.equal(records[0]?.sourceId, "yobang-x-plan-p9");
    assert.equal(records[0]?.platforms.aiLizhi, null);
    assert.equal(records[0]?.platforms.kugou, null);
    assert.equal(records[1]?.artistId, "anqi");
    assert.equal(records[1]?.platforms.kugou, 12);
    assert.equal(records[1]?.platforms.qqMusic, null);
    assert.equal("artist" in (records[0] || {}), false);
    assert.equal("lizhi" in (records[0]?.platforms || {}), false);
  });

  it("skips rows without a positive total instead of writing 0", () => {
    const result = sample();
    result.songs[0].totalVotes = null;
    result.songs[1].totalVotes = 0;
    assert.deepEqual(buildIngestRecords(result), []);
  });
});

describe("Shanghai source clock", () => {
  it("keeps the Shanghai calendar day when the chart clock is earlier the same evening", () => {
    assert.equal(
      combineShanghaiClock("更新至17:50", new Date("2026-11-09T09:57:05.477Z")),
      "2026-11-09T17:50:00+08:00",
    );
  });

  it("rolls back one Shanghai day when the clock is still yesterday", () => {
    assert.equal(
      combineShanghaiClock("更新至23:50", new Date("2026-11-08T16:05:00.000Z")),
      "2026-11-08T23:50:00+08:00",
    );
  });
});

describe("rate limit window", () => {
  it("allows a call after 60 seconds and rejects inside the window", () => {
    assert.equal(retryAfterSeconds(1_000, 1_000 + 59_000), 1);
    assert.equal(retryAfterSeconds(1_000, 1_000 + 60_000), 0);
  });
});
