import { CHART_RESERVE_MS, SCRAPE_BUDGET_MS } from "./targets";
import type { ArtistId, PlatformVotes, SongReading } from "./types";

const EMPTY: PlatformVotes = { aiLizhi: null, kugou: null, qqMusic: null };

export type DetailBind = {
  url: string;
  artistId: ArtistId | null;
  platforms: PlatformVotes;
  platformMiss: string | null;
  totalVotes?: number | null;
  rank?: number | null;
  sourceUpdateText?: string | null;
  note?: string;
};

export function allocateDetailSlots(input: {
  urlCount: number;
  scrapeBudgetMs?: number;
  chartReserveMs?: number;
}): { perDetailMs: number } {
  const scrapeBudgetMs = input.scrapeBudgetMs ?? SCRAPE_BUDGET_MS;
  const chartReserveMs = input.chartReserveMs ?? CHART_RESERVE_MS;
  const count = Math.max(input.urlCount, 1);
  const perDetailMs = Math.max(8_000, Math.floor((scrapeBudgetMs - chartReserveMs) / count));
  return { perDetailMs };
}

/** Sequential slots: each URL gets its own clock starting when that URL begins, not leftover global budget. */
export function slotDeadline(startedMs: number, perDetailMs: number): number {
  return startedMs + perDetailMs;
}

export function platformsHydrated(platforms: PlatformVotes): boolean {
  return [platforms.aiLizhi, platforms.kugou, platforms.qqMusic].every(
    (value) => typeof value === "number" && Number.isInteger(value) && value > 0,
  );
}

export function assignDetailsToSongs(songs: SongReading[], details: DetailBind[]): SongReading[] {
  const byArtist = new Map<ArtistId, DetailBind>();
  const unbound: DetailBind[] = [];
  for (const detail of details) {
    if (detail.artistId) byArtist.set(detail.artistId, detail);
    else unbound.push(detail);
  }
  return songs.map((song) => {
    const hit = byArtist.get(song.artistId);
    if (hit) {
      return {
        ...song,
        platforms: hit.platforms,
        platformMiss: hit.platformMiss,
        sourceUpdateText: hit.sourceUpdateText ?? song.sourceUpdateText,
      };
    }
    const leftover = unbound.shift();
    if (leftover) {
      return {
        ...song,
        platforms: { ...EMPTY },
        platformMiss: leftover.platformMiss || "detail_load_failed",
      };
    }
    return { ...song, platforms: { ...EMPTY }, platformMiss: "not_attempted_detail" };
  });
}
