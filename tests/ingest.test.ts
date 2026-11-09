import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildIngestPayload } from "../lib/ingest";
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
  it("uses 黄灿灿/安崎 as the only top-level keys and keeps missing platforms null", () => {
    const payload = buildIngestPayload(sample());
    assert.deepEqual(Object.keys(payload).sort(), ["安崎", "黄灿灿"].sort());
    assert.equal(payload["黄灿灿"]?.title, "早上坏");
    assert.equal(payload["黄灿灿"]?.totalVotes, 51008);
    assert.equal(payload["黄灿灿"]?.rank, 1);
    assert.equal(payload["黄灿灿"]?.sourceUpdateText, "更新至17:10");
    assert.equal(payload["黄灿灿"]?.platforms.lizhi, null);
    assert.equal(payload["安崎"]?.title, "Ice In My Walk");
    assert.equal(payload["安崎"]?.platforms.kugou, 12);
    assert.equal(payload["安崎"]?.platforms.qqMusic, null);
    assert.equal("source" in payload, false);
    assert.equal("songs" in payload, false);
  });
});

describe("rate limit window", () => {
  it("allows a call after 60 seconds and rejects inside the window", () => {
    assert.equal(retryAfterSeconds(1_000, 1_000 + 59_000), 1);
    assert.equal(retryAfterSeconds(1_000, 1_000 + 60_000), 0);
  });
});
