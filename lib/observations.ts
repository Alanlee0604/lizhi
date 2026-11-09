import type { ArtistId, PlatformVotes } from "./types";
import { combineShanghaiClock } from "./source-time";

function formatShanghai(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export type ObservationArtist = {
  id: string;
  artistId: ArtistId;
  total: number | null;
  rank: number | null;
  platforms: PlatformVotes;
  sourceDisplayedUpdatedAt: string;
  collectedAt: string | null;
  origin: string | null;
  liveCollector: boolean | null;
  provenance: {
    observer: string | null;
    notes: string | null;
    rawExcerpt: string | null;
    sourceId: string | null;
  };
};

export const OBSJ_MARK = "obsj:";
export const OBSERVATION_CADENCE_MINUTES = 2;
export const ATTEMPT_GROUP_MS = 2500;

export type ObservationRow = {
  collectedAt: string;
  collectedLabel: string;
  sourceDisplayedUpdatedAt: string | null;
  sourceLabel: string | null;
  sourceUnchanged: boolean;
  anqi: ObservationArtist | null;
  huangcancan: ObservationArtist | null;
};

export type ParsedAttemptReading = {
  attemptId: string;
  at: string;
  artistId: ArtistId;
  total: number | null;
  rank: number | null;
  sourceDisplayedUpdatedAt: string | null;
  sourceUpdateText: string | null;
  platforms: PlatformVotes;
  platformsStructured: boolean;
  message: string | null;
  rawExcerpt: string;
};

const EMPTY_PLATFORMS: PlatformVotes = { aiLizhi: null, kugou: null, qqMusic: null };

export function encodeObservationExcerpt(input: {
  sourceUpdateText: string | null | undefined;
  artist: string;
  title: string;
  rank: number | null;
  total: number;
  platforms: PlatformVotes;
}): string {
  const payload = JSON.stringify({
    aiLizhi: input.platforms.aiLizhi,
    kugou: input.platforms.kugou,
    qqMusic: input.platforms.qqMusic,
  });
  return `${input.sourceUpdateText || ""} ${input.artist} ${input.title} rank=${input.rank} total=${input.total} ${OBSJ_MARK}${payload}`.trim().slice(0, 4000);
}

function asArtistId(value: string | null | undefined): ArtistId | null {
  if (value === "anqi" || value === "huangcancan") return value;
  if (value?.includes("安崎")) return "anqi";
  if (value?.includes("黄灿灿") || value?.includes("灿灿")) return "huangcancan";
  return null;
}

function parsePlatformsJson(raw: string): { platforms: PlatformVotes; structured: boolean } {
  const index = raw.indexOf(OBSJ_MARK);
  if (index < 0) return { platforms: { ...EMPTY_PLATFORMS }, structured: false };
  try {
    const parsed = JSON.parse(raw.slice(index + OBSJ_MARK.length).trim()) as Record<string, unknown>;
    const read = (key: keyof PlatformVotes): number | null => {
      const value = parsed[key];
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    };
    return {
      platforms: { aiLizhi: read("aiLizhi"), kugou: read("kugou"), qqMusic: read("qqMusic") },
      structured: true,
    };
  } catch {
    return { platforms: { ...EMPTY_PLATFORMS }, structured: false };
  }
}

export function parseAttemptReading(raw: unknown): ParsedAttemptReading | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const at = typeof row.at === "string" && row.at.trim() ? row.at : null;
  const excerpt = typeof row.rawExcerpt === "string" ? row.rawExcerpt : "";
  const message = typeof row.message === "string" ? row.message : null;
  if (!at || !excerpt) return null;

  const artistId =
    asArtistId(typeof row.artistId === "string" ? row.artistId : null) ||
    asArtistId(excerpt) ||
    asArtistId(message);
  if (!artistId) return null;

  const totalMatch = excerpt.match(/\btotal=(\d+)\b/i);
  const rankMatch = excerpt.match(/\brank=(\d+)\b/i);
  const total = totalMatch ? Number(totalMatch[1]) : null;
  if (total == null || !Number.isInteger(total) || total <= 0) return null;

  const collectedAt = new Date(at);
  if (Number.isNaN(collectedAt.getTime())) return null;
  const sourceDisplayedUpdatedAt = combineShanghaiClock(excerpt, collectedAt);
  if (!sourceDisplayedUpdatedAt) return null;

  const clock = excerpt.match(/更新至\s*(\d{1,2}:\d{2})/);
  const { platforms, structured } = parsePlatformsJson(excerpt);
  return {
    attemptId: typeof row.id === "string" && row.id.trim() ? row.id : `${artistId}::${at}`,
    at,
    artistId,
    total,
    rank: rankMatch && Number.isInteger(Number(rankMatch[1])) ? Number(rankMatch[1]) : null,
    sourceDisplayedUpdatedAt,
    sourceUpdateText: clock ? `更新至${clock[1]}` : null,
    platforms,
    platformsStructured: structured,
    message,
    rawExcerpt: excerpt,
  };
}

export function snapshotFromAttempt(reading: ParsedAttemptReading): ObservationArtist {
  return {
    id: reading.attemptId,
    artistId: reading.artistId,
    total: reading.total,
    rank: reading.rank,
    platforms: reading.platforms,
    sourceDisplayedUpdatedAt: reading.sourceDisplayedUpdatedAt || reading.at,
    collectedAt: reading.at,
    origin: "public_html",
    liveCollector: true,
    provenance: {
      observer: "votes_attempt",
      notes: reading.platformsStructured
        ? "attempt.rawExcerpt 含本轮 obsj 四项"
        : "attempt.rawExcerpt 仅有本轮 total/rank/源时间；三端未随该轮结构化记录，保持未提供，不从后来快照回填",
      rawExcerpt: reading.rawExcerpt,
      sourceId: "yobang-x-plan-p9",
    },
  };
}

export function groupAttemptRounds(readings: ParsedAttemptReading[]): ObservationRow[] {
  const sorted = [...readings].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const buckets: ParsedAttemptReading[][] = [];
  for (const reading of sorted) {
    const last = buckets.at(-1);
    const lastAt = last?.[0] ? Date.parse(last[0].at) : NaN;
    const nextAt = Date.parse(reading.at);
    if (last && Number.isFinite(lastAt) && Number.isFinite(nextAt) && nextAt - lastAt <= ATTEMPT_GROUP_MS) {
      last.push(reading);
    } else {
      buckets.push([reading]);
    }
  }

  const rows: ObservationRow[] = [];
  for (const bucket of buckets) {
    let anqi: ObservationArtist | null = null;
    let huangcancan: ObservationArtist | null = null;
    for (const reading of bucket) {
      const snap = snapshotFromAttempt(reading);
      if (reading.artistId === "anqi") {
        if (!anqi || reading.at > (anqi.collectedAt || "")) anqi = snap;
      } else if (!huangcancan || reading.at > (huangcancan.collectedAt || "")) {
        huangcancan = snap;
      }
    }
    const collectedAt = bucket.map((item) => item.at).sort().at(-1);
    if (!collectedAt) continue;
    const sources = [...new Set(bucket.map((item) => item.sourceDisplayedUpdatedAt).filter(Boolean))] as string[];
    const sourceDisplayedUpdatedAt = sources.length === 1 ? sources[0] : sources[0] || null;
    rows.push({
      collectedAt,
      collectedLabel: formatShanghai(collectedAt) || collectedAt,
      sourceDisplayedUpdatedAt,
      sourceLabel: sourceDisplayedUpdatedAt ? formatShanghai(sourceDisplayedUpdatedAt) : null,
      sourceUnchanged: false,
      anqi,
      huangcancan,
    });
  }

  for (let index = 0; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (!current) continue;
    current.sourceUnchanged = Boolean(
      previous?.sourceDisplayedUpdatedAt &&
        current.sourceDisplayedUpdatedAt &&
        previous.sourceDisplayedUpdatedAt === current.sourceDisplayedUpdatedAt,
    );
  }

  return rows.sort((a, b) => (a.collectedAt < b.collectedAt ? 1 : -1));
}

export function buildObservationRows(attempts: unknown): ObservationRow[] {
  if (!Array.isArray(attempts)) return [];
  const readings = attempts.map(parseAttemptReading).filter((item): item is ParsedAttemptReading => item !== null);
  return groupAttemptRounds(readings);
}
