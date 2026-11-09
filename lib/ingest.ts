import { DEFAULT_INGEST_URL } from "./targets";
import type { IngestResult, PlatformVotes, ProbeSuccess, SongReading } from "./types";

export type IngestArtistRecord = {
  title: string;
  rank: number | null;
  totalVotes: number | null;
  sourceUpdateText: string | null;
  collectedAtUtc: string;
  collectedAtBeijing: string;
  platforms: PlatformVotes;
};

export type IngestPayload = Record<string, IngestArtistRecord>;

function recordFor(song: SongReading, result: ProbeSuccess): IngestArtistRecord {
  return {
    title: song.title,
    rank: song.rank,
    totalVotes: song.totalVotes,
    sourceUpdateText: result.sourceUpdateText,
    collectedAtUtc: result.collectedAtUtc,
    collectedAtBeijing: result.collectedAtBeijing,
    platforms: {
      lizhi: song.platforms.lizhi,
      kugou: song.platforms.kugou,
      qqMusic: song.platforms.qqMusic,
    },
  };
}

export function buildIngestPayload(result: ProbeSuccess): IngestPayload {
  const payload: IngestPayload = {};
  for (const song of result.songs) {
    payload[song.artist] = recordFor(song, result);
  }
  return payload;
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

  const url = process.env.INGEST_URL || DEFAULT_INGEST_URL;
  const payload = buildIngestPayload(result);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      attempted: true,
      ok: response.ok,
      skipped: false,
      reason: response.ok ? null : `ingest HTTP ${response.status}`,
      status: response.status,
      body: text.slice(0, 2000),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      attempted: true,
      ok: false,
      skipped: false,
      reason: message,
      status: null,
      body: null,
    };
  } finally {
    clearTimeout(timer);
  }
}
