import { DEFAULT_INGEST_URL } from "./targets";
import type { IngestResult, PlatformVotes, ProbeSuccess, SongReading } from "./types";

export type IngestArtistRecord = {
  artist: string;
  title: string;
  rank: number | null;
  totalVotes: number | null;
  votes: number | null;
  sourceUpdateText: string | null;
  collectedAtUtc: string;
  collectedAtBeijing: string;
  platforms: PlatformVotes;
};

export function buildIngestRecords(result: ProbeSuccess): IngestArtistRecord[] {
  return result.songs.map((song: SongReading) => ({
    artist: song.artist,
    title: song.title,
    rank: song.rank,
    totalVotes: song.totalVotes,
    votes: song.totalVotes,
    sourceUpdateText: result.sourceUpdateText,
    collectedAtUtc: result.collectedAtUtc,
    collectedAtBeijing: result.collectedAtBeijing,
    platforms: {
      lizhi: song.platforms.lizhi,
      kugou: song.platforms.kugou,
      qqMusic: song.platforms.qqMusic,
    },
  }));
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
  const records = buildIngestRecords(result);
  const parts: string[] = [];
  let ok = true;
  let lastStatus: number | null = null;
  try {
    for (const record of records) {
      const posted = await postOne(url, token, record);
      lastStatus = posted.status;
      parts.push(`${record.artist}:${posted.status}:${posted.body}`);
      if (posted.status < 200 || posted.status >= 300) ok = false;
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
