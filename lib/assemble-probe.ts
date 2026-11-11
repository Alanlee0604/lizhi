import { assignDetailsToSongs, platformsHydrated } from "./detail-assign";
import { TARGET_SONGS } from "./targets";
import { isPositiveInt } from "./source-time";
import type { ArtistId, PlatformVotes, SongReading } from "./types";

const EMPTY: PlatformVotes = { aiLizhi: null, kugou: null, qqMusic: null };

export type CapturedDetail = {
  url: string;
  artistId: ArtistId | null;
  artist: string | null;
  title: string | null;
  platforms: PlatformVotes;
  platformMiss: string | null;
  note: string;
  totalVotes: number | null;
  rank: number | null;
  sourceUpdateText: string | null;
};

export function isDeadBrowserError(message: string): boolean {
  return /Target closed|Session closed|Connection closed|detached Frame|Frame detached|Protocol error|Browser closed|Network\.enable|Target\.createTarget/i.test(
    message,
  );
}

export function keepParsedDetail(detail: CapturedDetail, sideEffectError?: string): CapturedDetail {
  const hasIdentity = Boolean(detail.artistId);
  const hasTotal = isPositiveInt(detail.totalVotes);
  const hasPlatforms = platformsHydrated(detail.platforms);
  if (!sideEffectError || !(hasIdentity && (hasTotal || hasPlatforms))) return detail;
  return {
    ...detail,
    note: `${detail.note} 截图/侧效应失败已忽略（${sideEffectError.slice(0, 160)}），已读数字保留。`,
  };
}

export function persistableSong(song: SongReading): boolean {
  return song.found && isPositiveInt(song.totalVotes);
}

export function songsFromDetailsOnly(details: CapturedDetail[]): SongReading[] {
  const byArtist = new Map<ArtistId, CapturedDetail>();
  const unbound: CapturedDetail[] = [];
  for (const detail of details) {
    if (detail.artistId) byArtist.set(detail.artistId, detail);
    else unbound.push(detail);
  }
  return TARGET_SONGS.map((target) => {
    const hit = byArtist.get(target.artistId);
    if (hit) {
      const hasTotal = isPositiveInt(hit.totalVotes);
      return {
        ...target,
        found: hasTotal,
        rank: isPositiveInt(hit.rank) ? hit.rank : null,
        totalVotes: hasTotal ? hit.totalVotes : null,
        platforms: hit.platforms,
        platformMiss: hit.platformMiss,
        sourceUpdateText: hit.sourceUpdateText,
      };
    }
    const leftover = unbound.shift();
    return {
      ...target,
      found: false,
      rank: null,
      totalVotes: null,
      platforms: { ...EMPTY },
      platformMiss: leftover?.platformMiss || "detail_load_failed",
      sourceUpdateText: null,
    };
  });
}

export function assembleSongs(input: {
  chartSongs: SongReading[] | null;
  chartSourceUpdateText: string | null;
  details: CapturedDetail[];
  chartError?: string | null;
}): { songs: SongReading[]; sourceUpdateText: string | null; notes: string[] } {
  const notes: string[] = [];
  if (input.chartError) {
    notes.push(`总榜失败，不丢已读详情：${input.chartError.slice(0, 240)}`);
  }
  const songs = input.chartSongs
    ? assignDetailsToSongs(input.chartSongs, input.details).map((song) => {
        const detail = input.details.find((item) => item.artistId === song.artistId);
        return {
          ...song,
          sourceUpdateText: detail?.sourceUpdateText || input.chartSourceUpdateText,
        };
      })
    : songsFromDetailsOnly(input.details);

  const persistable = songs.filter(persistableSong);
  const sourceUpdateText =
    input.chartSourceUpdateText || persistable.find((song) => song.sourceUpdateText)?.sourceUpdateText || null;
  if (!input.chartSongs && persistable.length > 0) {
    notes.push("总榜不可用，已按详情页身份/源时间/总票组装可入库行；缺的人保持缺口，不拿别人的数填。");
  }
  return { songs, sourceUpdateText, notes };
}

export function probeHasPersistableSongs(songs: SongReading[]): boolean {
  return songs.some(persistableSong);
}
