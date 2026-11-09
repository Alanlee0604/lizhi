import { encodeObservationExcerpt } from "./observations";
import { DEFAULT_INGEST_URL } from "./targets";
import { combineShanghaiClock, isPositiveInt } from "./source-time";
import type { ArtistId, IngestResult, ProbeSuccess, SongReading } from "./types";

const ALLOWED_ARTIST_IDS = new Set<ArtistId>(["anqi", "huangcancan"]);

export type IngestArtistRecord = {
  artistId: ArtistId;
  total: number;
  sourceDisplayedUpdatedAt: string;
  rank: number | null;
  collectedAt: string;
  platforms: {
    aiLizhi: number | null;
    kugou: number | null;
    qqMusic: number | null;
  };
  origin: "public_html";
  liveCollector: true;
  observer: "vercel_function_chromium";
  sourceId: "yobang-x-plan-p9";
  notes: string;
  rawExcerpt: string;
};

function nonNegativeIntOrNull(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

function platformsFor(song: SongReading): IngestArtistRecord["platforms"] {
  return {
    aiLizhi: nonNegativeIntOrNull(song.platforms.aiLizhi),
    kugou: nonNegativeIntOrNull(song.platforms.kugou),
    qqMusic: nonNegativeIntOrNull(song.platforms.qqMusic),
  };
}

export function buildIngestRecords(result: ProbeSuccess): IngestArtistRecord[] {
  const sourceDisplayedUpdatedAt = combineShanghaiClock(
    result.sourceUpdateText,
    new Date(result.collectedAtUtc),
  );
  if (!sourceDisplayedUpdatedAt) return [];

  const records: IngestArtistRecord[] = [];
  for (const song of result.songs) {
    if (!song.found) continue;
    if (!ALLOWED_ARTIST_IDS.has(song.artistId)) continue;
    if (!isPositiveInt(song.totalVotes)) continue;
    records.push({
      artistId: song.artistId,
      total: song.totalVotes,
      sourceDisplayedUpdatedAt,
      rank: isPositiveInt(song.rank) ? song.rank : null,
      collectedAt: result.collectedAtUtc,
      platforms: platformsFor(song),
      origin: "public_html",
      liveCollector: true,
      observer: "vercel_function_chromium",
      sourceId: "yobang-x-plan-p9",
      notes: song.platformMiss
        ? `visible public chart + song-detail DOM; 三端未采集到：${song.platformMiss}；null 不是 0，不断言腾讯未提供`
        : "visible public chart + song-detail DOM; obsj in rawExcerpt is this-round platforms from the public detail page",
      rawExcerpt: encodeObservationExcerpt({
        sourceUpdateText: result.sourceUpdateText,
        artist: song.artist,
        title: song.title,
        rank: isPositiveInt(song.rank) ? song.rank : null,
        total: song.totalVotes,
        platforms: platformsFor(song),
        miss: song.platformMiss,
      }),
    });
  }
  return records;
}

async function postOne(
  url: string,
  token: string,
  record: IngestArtistRecord,
): Promise<{ status: number; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(record),
      signal: controller.signal,
    });
    return { status: response.status, body: (await response.text()).slice(0, 1000) };
  } finally {
    clearTimeout(timer);
  }
}

function ingestAccepted(status: number): boolean {
  return status === 200 || status === 201;
}

export async function postIngest(result: ProbeSuccess): Promise<IngestResult> {
  const token = process.env.INGEST_TOKEN;
  if (!token) {
    return {
      attempted: false,
      ok: false,
      skipped: true,
      reason: "INGEST_TOKEN is not set on this deployment.",
      status: null,
      body: null,
    };
  }

  const records = buildIngestRecords(result);
  if (records.length === 0) {
    return {
      attempted: false,
      ok: false,
      skipped: true,
      reason: "no ingestable rows (need artistId anqi|huangcancan, positive total, parseable sourceDisplayedUpdatedAt).",
      status: null,
      body: null,
    };
  }

  const url = process.env.INGEST_URL || DEFAULT_INGEST_URL;
  const parts: string[] = [];
  let ok = true;
  let lastStatus: number | null = null;
  try {
    for (const record of records) {
      const posted = await postOne(url, token, record);
      lastStatus = posted.status;
      parts.push(`${record.artistId}:${posted.status}:${posted.body}`);
      if (!ingestAccepted(posted.status)) ok = false;
    }
    return {
      attempted: true,
      ok,
      skipped: false,
      reason: ok ? null : "ingest HTTP error",
      status: lastStatus,
      body: parts.join(" | ").slice(0, 2000),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      attempted: true,
      ok: false,
      skipped: false,
      reason: message,
      status: lastStatus,
      body: parts.join(" | ").slice(0, 2000) || null,
    };
  }
}
