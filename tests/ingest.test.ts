import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildIngestRecords } from "../lib/ingest";
import { retryAfterSeconds } from "../lib/limits";
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
        artist: "黄灿灿",
        title: "早上坏",
        found: true,
        rank: 1,
        totalVotes: 51008,
        platforms: { lizhi: null, kugou: null, qqMusic: null },
      },
      {
        id: "anqi-ice-in-my-walk",
        artist: "安崎",
        title: "Ice In My Walk",
        found: true,
        rank: 2,
        totalVotes: 25457,
        platforms: { lizhi: null, kugou: 12, qqMusic: null },
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
  it("posts one record per artist with rank, votes, source update and null platforms", () => {
    const records = buildIngestRecords(sample());
    assert.equal(records.length, 2);
    assert.equal(records[0]?.artist, "黄灿灿");
    assert.equal(records[0]?.title, "早上坏");
    assert.equal(records[0]?.totalVotes, 51008);
    assert.equal(records[0]?.votes, 51008);
    assert.equal(records[0]?.rank, 1);
    assert.equal(records[0]?.sourceUpdateText, "更新至17:10");
    assert.equal(records[0]?.platforms.lizhi, null);
    assert.equal(records[1]?.artist, "安崎");
    assert.equal(records[1]?.title, "Ice In My Walk");
    assert.equal(records[1]?.platforms.kugou, 12);
    assert.equal(records[1]?.platforms.qqMusic, null);
  });
});

describe("rate limit window", () => {
  it("allows a call after 60 seconds and rejects inside the window", () => {
    assert.equal(retryAfterSeconds(1_000, 1_000 + 59_000), 1);
    assert.equal(retryAfterSeconds(1_000, 1_000 + 60_000), 0);
  });
});
