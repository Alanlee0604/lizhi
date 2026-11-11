import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allocateDetailSlots, assignDetailsToSongs, platformsHydrated, slotDeadline } from "../lib/detail-assign";
import { CHART_RESERVE_MS, SCRAPE_BUDGET_MS, TARGET_SONGS } from "../lib/targets";
import type { SongReading } from "../lib/types";

const EMPTY = { aiLizhi: null, kugou: null, qqMusic: null };

function chartSong(artistId: "anqi" | "huangcancan", extra: Partial<SongReading> = {}): SongReading {
  const target = TARGET_SONGS.find((song) => song.artistId === artistId)!;
  return {
    ...target,
    found: true,
    rank: artistId === "huangcancan" ? 1 : 2,
    totalVotes: 100,
    platforms: { ...EMPTY },
    platformMiss: "not_attempted_detail",
    ...extra,
  };
}

describe("detail slot budget", () => {
  it("gives each public detail URL its own slot instead of leftover global budget", () => {
    const { perDetailMs } = allocateDetailSlots({ urlCount: 2 });
    assert.equal(perDetailMs, Math.floor((SCRAPE_BUDGET_MS - CHART_RESERVE_MS) / 2));
    assert.equal(perDetailMs, 36_500);
    assert.ok(perDetailMs * 2 + CHART_RESERVE_MS <= SCRAPE_BUDGET_MS);

    const firstStart = 1_000;
    const secondStart = firstStart + perDetailMs;
    assert.equal(slotDeadline(firstStart, perDetailMs) - firstStart, perDetailMs);
    assert.equal(slotDeadline(secondStart, perDetailMs) - secondStart, perDetailMs);
    assert.ok(slotDeadline(secondStart, perDetailMs) - firstStart > 12_000);
  });
});

describe("assignDetailsToSongs", () => {
  it("keeps DOM-bound identity and does not relabel a timed-out unbound URL as not_attempted_detail", () => {
    const songs = assignDetailsToSongs(
      [chartSong("huangcancan"), chartSong("anqi")],
      [
        {
          url: "https://c6.y.qq.com/base/fcgi-bin/u?__=Al0gtgNAqK9e",
          artistId: "huangcancan",
          platforms: { aiLizhi: 1, kugou: 2, qqMusic: 3 },
          platformMiss: null,
        },
        {
          url: "https://c6.y.qq.com/base/fcgi-bin/u?__=b40cE93Aqkgo",
          artistId: null,
          platforms: { ...EMPTY },
          platformMiss: "timeout",
        },
      ],
    );
    const huang = songs.find((song) => song.artistId === "huangcancan");
    const anqi = songs.find((song) => song.artistId === "anqi");
    assert.deepEqual(huang?.platforms, { aiLizhi: 1, kugou: 2, qqMusic: 3 });
    assert.equal(huang?.platformMiss, null);
    assert.deepEqual(anqi?.platforms, EMPTY);
    assert.equal(anqi?.platformMiss, "timeout");
  });

  it("only uses not_attempted_detail when that artist has no leftover URL result", () => {
    const songs = assignDetailsToSongs([chartSong("huangcancan"), chartSong("anqi")], [
      {
        url: "https://c6.y.qq.com/base/fcgi-bin/u?__=Al0gtgNAqK9e",
        artistId: "huangcancan",
        platforms: { aiLizhi: 9, kugou: 8, qqMusic: 7 },
        platformMiss: null,
      },
    ]);
    assert.equal(songs.find((song) => song.artistId === "anqi")?.platformMiss, "not_attempted_detail");
  });
});

describe("platformsHydrated", () => {
  it("rejects placeholder zeros and partial platforms", () => {
    assert.equal(platformsHydrated({ aiLizhi: 0, kugou: 0, qqMusic: 0 }), false);
    assert.equal(platformsHydrated({ aiLizhi: 13717, kugou: null, qqMusic: 87290 }), false);
    assert.equal(platformsHydrated({ aiLizhi: 13717, kugou: 37605, qqMusic: 87290 }), true);
  });
});
