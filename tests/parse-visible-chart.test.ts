import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  extractFreshHitZone,
  looksLikeRestriction,
  parsePlatformVotes,
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
      assert.equal(song.platforms.lizhi, null);
      assert.equal(song.platforms.kugou, null);
      assert.equal(song.platforms.qqMusic, null);
    }
    assert.deepEqual(parsePlatformVotes("早上坏\n50,715\n票"), {
      lizhi: null,
      kugou: null,
      qqMusic: null,
    });
    assert.deepEqual(parsePlatformVotes("早上坏\nai荔枝 12\n酷狗 8\nQQ音乐 5"), {
      lizhi: 12,
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
