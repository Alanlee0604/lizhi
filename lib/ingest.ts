import { CHART_TITLE, DEFAULT_INGEST_URL, PERIOD, ZONE_NAME } from "./targets";
import type { IngestResult, ProbeSuccess } from "./types";

export type IngestPayload = {
  source: "lizhi-readonly-verify";
  collector: "vercel-function-chromium";
  chartTitle: string;
  period: string;
  zoneName: string;
  sourceUpdateText: string | null;
  collectedAtUtc: string;
  collectedAtBeijing: string;
  songs: Array<{
    artist: string;
    title: string;
    rank: number | null;
    totalVotes: number | null;
    platforms: {
      lizhi: number | null;
      kugou: number | null;
      qqMusic: number | null;
    };
  }>;
};

export function buildIngestPayload(result: ProbeSuccess): IngestPayload {
  return {
    source: "lizhi-readonly-verify",
    collector: "vercel-function-chromium",
    chartTitle: result.chartTitle || CHART_TITLE,
    period: result.period || PERIOD,
    zoneName: result.zoneName || ZONE_NAME,
    sourceUpdateText: result.sourceUpdateText,
    collectedAtUtc: result.collectedAtUtc,
    collectedAtBeijing: result.collectedAtBeijing,
    songs: result.songs.map((song) => ({
      artist: song.artist,
      title: song.title,
      rank: song.rank,
      totalVotes: song.totalVotes,
      platforms: {
        lizhi: song.platforms.lizhi,
        kugou: song.platforms.kugou,
        qqMusic: song.platforms.qqMusic,
      },
    })),
  };
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
