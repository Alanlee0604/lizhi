import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assembleSongs,
  isDeadBrowserError,
  keepParsedDetail,
  persistableSong,
  probeHasPersistableSongs,
  songsFromDetailsOnly,
  type CapturedDetail,
} from "../lib/assemble-probe";
import { buildIngestRecords } from "../lib/ingest";
import { combineShanghaiClock } from "../lib/source-time";
import type { ProbeSuccess, SongReading } from "../lib/types";

const HUANG_DETAIL: CapturedDetail = {
  url: "https://c6.y.qq.com/base/fcgi-bin/u?__=Al0gtgNAqK9e",
  artistId: "huangcancan",
  artist: "黄灿灿",
  title: "早上坏",
  platforms: { aiLizhi: 34476, kugou: 60025, qqMusic: 184072 },
  platformMiss: null,
  note: "终页实读 黄灿灿《早上坏》",
  totalVotes: 278573,
  rank: null,
  sourceUpdateText: "更新至02:40",
};

const ANQI_DEAD: CapturedDetail = {
  url: "https://c6.y.qq.com/base/fcgi-bin/u?__=b40cE93Aqkgo",
  artistId: null,
  artist: null,
  title: null,
  platforms: { aiLizhi: null, kugou: null, qqMusic: null },
  platformMiss: "detail_load_failed",
  note: "Protocol error (Target.captureScreenshot): Target closed.",
  totalVotes: null,
  rank: null,
  sourceUpdateText: null,
};

describe("dead browser errors", () => {
  it("recognizes detached Frame / screenshot Protocol error / Connection closed", () => {
    assert.equal(isDeadBrowserError("Protocol error (Runtime.callFunctionOn): Inspector.targetCrashed - detached Frame"), true);
    assert.equal(isDeadBrowserError("Protocol error (Page.captureScreenshot): Target closed."), true);
    assert.equal(isDeadBrowserError("waitForFunction: Attempted to use detached Frame"), true);
    assert.equal(isDeadBrowserError("Navigation failed because browser has disconnected! Connection closed."), true);
    assert.equal(isDeadBrowserError("HTTP 404"), false);
  });
});

describe("keepParsedDetail", () => {
  it("does not drop hydrated 三端 when optional screenshot throws Protocol error", () => {
    const parsed: CapturedDetail = {
      ...HUANG_DETAIL,
      rank: 1,
    };
    const kept = keepParsedDetail(parsed, "Protocol error (Page.captureScreenshot): Target closed.");
    assert.equal(kept.artistId, "huangcancan");
    assert.equal(kept.totalVotes, 278573);
    assert.deepEqual(kept.platforms, { aiLizhi: 34476, kugou: 60025, qqMusic: 184072 });
    assert.match(kept.note, /截图\/侧效应失败已忽略/);
  });
});

describe("assemble after chart crash", () => {
  it("persists 黄灿灿 detail-only 02:40 reading and leaves 安崎 as a gap", () => {
    const assembled = assembleSongs({
      chartSongs: null,
      chartSourceUpdateText: null,
      details: [HUANG_DETAIL, ANQI_DEAD],
      chartError: "Attempted to use detached Frame",
    });
    const huang = assembled.songs.find((song) => song.artistId === "huangcancan");
    const anqi = assembled.songs.find((song) => song.artistId === "anqi");
    assert.equal(persistableSong(huang as SongReading), true);
    assert.equal(huang?.totalVotes, 278573);
    assert.equal(huang?.rank, null);
    assert.equal(huang?.sourceUpdateText, "更新至02:40");
    assert.equal(anqi?.found, false);
    assert.equal(anqi?.totalVotes, null);
    assert.equal(anqi?.platformMiss, "detail_load_failed");
    assert.equal(assembled.sourceUpdateText, "更新至02:40");
    assert.equal(probeHasPersistableSongs(assembled.songs), true);
    assert.equal(
      (huang?.platforms.aiLizhi || 0) + (huang?.platforms.kugou || 0) + (huang?.platforms.qqMusic || 0),
      278573,
    );
  });

  it("does not copy 黄灿灿 numbers onto 安崎", () => {
    const songs = songsFromDetailsOnly([HUANG_DETAIL, ANQI_DEAD]);
    const anqi = songs.find((song) => song.artistId === "anqi");
    assert.equal(anqi?.platforms.aiLizhi, null);
    assert.equal(anqi?.totalVotes, null);
  });
});

describe("ingest from detail-only probe success", () => {
  it("writes 黄灿灿 with Shanghai +08:00 source time and rank null, skips 安崎", () => {
    const assembled = assembleSongs({
      chartSongs: null,
      chartSourceUpdateText: null,
      details: [HUANG_DETAIL, ANQI_DEAD],
      chartError: "Connection closed",
    });
    const result: ProbeSuccess = {
      ok: true,
      layer: "vercel-function-chromium",
      chartTitle: "打歌2026·X舞台",
      period: "第9期",
      zoneName: "鲜打专区",
      sourceUrl: "https://example.invalid",
      finalUrl: "https://example.invalid/chart",
      sourceUpdateText: assembled.sourceUpdateText,
      collectedAtUtc: "2026-11-11T18:51:35.000Z",
      collectedAtBeijing: "2026/11/12 02:51:35",
      songs: assembled.songs,
      restriction: null,
      screenshotJpegBase64: null,
      notes: assembled.notes,
      rateLimit: { limit: "1/min", retryAfterSeconds: 60 },
      ingest: null,
    };
    const records = buildIngestRecords(result);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.artistId, "huangcancan");
    assert.equal(records[0]?.total, 278573);
    assert.equal(records[0]?.rank, null);
    assert.equal(records[0]?.sourceDisplayedUpdatedAt, "2026-11-12T02:40:00+08:00");
    assert.equal(records[0]?.platforms.aiLizhi, 34476);
    assert.equal(records[0]?.platforms.kugou, 60025);
    assert.equal(records[0]?.platforms.qqMusic, 184072);
    assert.match(records[0]?.rawExcerpt || "", /更新至02:40/);
    assert.equal(
      combineShanghaiClock("更新至02:40", new Date("2026-11-11T18:51:35.000Z")),
      "2026-11-12T02:40:00+08:00",
    );
  });
});
