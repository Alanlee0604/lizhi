import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  extractFreshHitZone,
  identifyDetailTarget,
  looksLikeRestriction,
  parseDetailPlatformVotes,
  parsePlatformVotes,
  parseSongDetail,
  parseSourceUpdateText,
  readTargetSongs,
} from "../lib/parse-visible-chart";

const fixture = readFileSync(
  new URL("../fixtures/fresh-zone-visible-2026-11-09T1708-beijing.txt", import.meta.url),
  "utf8",
);

describe("parse visible 鲜打专区 text", () => {
  it("extracts the zone that contains vote rows rather than the artist teaser list", () => {
    const zone = extractFreshHitZone(fixture);
    assert.ok(zone);
    assert.match(zone, /早上坏/);
    assert.match(zone, /50,715/);
  });

  it("reads rank, total votes and source update text for the two target songs", () => {
    const parsed = readTargetSongs(fixture);
    assert.equal(parsed.sourceUpdateText, "更新至17:00");
    const huang = parsed.songs.find((s) => s.id === "huangcancan-zaoshanghuai");
    const anqi = parsed.songs.find((s) => s.id === "anqi-ice-in-my-walk");
    assert.deepEqual(
      { found: huang?.found, rank: huang?.rank, totalVotes: huang?.totalVotes },
      { found: true, rank: 1, totalVotes: 50715 },
    );
    assert.deepEqual(
      { found: anqi?.found, rank: anqi?.rank, totalVotes: anqi?.totalVotes },
      { found: true, rank: 2, totalVotes: 25060 },
    );
  });

  it("keeps missing platform breakdowns as null instead of 0", () => {
    const parsed = readTargetSongs(fixture);
    for (const song of parsed.songs) {
      assert.equal(song.platforms.aiLizhi, null);
      assert.equal(song.platforms.kugou, null);
      assert.equal(song.platforms.qqMusic, null);
    }
    assert.deepEqual(parsePlatformVotes("早上坏\n50,715\n票"), {
      aiLizhi: null,
      kugou: null,
      qqMusic: null,
    });
    assert.deepEqual(parsePlatformVotes("早上坏\nai荔枝 12\n酷狗 8\nQQ音乐 5"), {
      aiLizhi: 12,
      kugou: 8,
      qqMusic: 5,
    });
  });

  it("treats captcha copy as a hard stop", () => {
    const result = looksLikeRestriction("请完成人机验证后继续");
    assert.equal(result.kind, "captcha");
  });

  it("reads 更新至 clock text from the zone", () => {
    assert.equal(parseSourceUpdateText(fixture), "更新至17:00");
  });
});

const detailFixture = readFileSync(
  new URL("../fixtures/song-detail-visible-2026-11-09T1934-beijing.txt", import.meta.url),
  "utf8",
);

describe("parse public song-detail text", () => {
  it("reads ai荔枝 / 酷狗 / QQ音乐 from the detail page, not from 我的余票 0", () => {
    const parsed = parseSongDetail(detailFixture, { title: "早上坏", artist: "黄灿灿" });
    assert.equal(parsed.found, true);
    assert.equal(parsed.totalVotes, 58681);
    assert.equal(parsed.rank, 1);
    assert.equal(parsed.sourceUpdateText, "更新至19:30");
    assert.deepEqual(parsed.platforms, { aiLizhi: 24993, kugou: 9267, qqMusic: 24421 });
    assert.equal(parsed.platforms.aiLizhi! + parsed.platforms.kugou! + parsed.platforms.qqMusic!, 58681);
  });

  it("does not treat 酷狗音乐为TA投票 as a kugou count", () => {
    assert.deepEqual(parseDetailPlatformVotes("去酷狗音乐为TA投票\n我的余票\n0\n票"), {
      aiLizhi: null,
      kugou: null,
      qqMusic: null,
    });
  });

  it("binds each detail page from visible 歌手/歌名, not from the short-link slug", () => {
    const anqiText = readFileSync(new URL("../fixtures/song-detail-anqi-visible.txt", import.meta.url), "utf8");
    assert.equal(identifyDetailTarget(detailFixture)?.artistId, "huangcancan");
    assert.equal(identifyDetailTarget(anqiText)?.artistId, "anqi");
    assert.equal(identifyDetailTarget("第9期 鲜打专区 去支持"), null);
  });
});
