import { DEFAULT_STATE_URL } from "./targets";
import { beijingNow } from "./time";
import type { ArtistId } from "./types";

export type HistoryPlatforms = {
  aiLizhi: number | null;
  kugou: number | null;
  qqMusic: number | null;
};

export type HistoryProvenance = {
  observer: string | null;
  notes: string | null;
  rawExcerpt: string | null;
  sourceId: string | null;
};

export type HistorySnapshot = {
  id: string;
  artistId: ArtistId;
  total: number | null;
  rank: number | null;
  platforms: HistoryPlatforms;
  sourceDisplayedUpdatedAt: string;
  collectedAt: string | null;
  origin: string | null;
  liveCollector: boolean | null;
  provenance: HistoryProvenance;
};

export type TimelineRow = {
  sourceDisplayedUpdatedAt: string;
  sourceLabel: string;
  anqi: HistorySnapshot | null;
  huangcancan: HistorySnapshot | null;
};

export type HistoryArtistView = {
  artistId: ArtistId;
  displayName: string;
  songTitle: string | null;
  sampleCount: number;
  latest: HistorySnapshot | null;
  freshness: {
    sourceUpdated: string | null;
    collected: string | null;
    originLabel: string | null;
    liveCollector: boolean | null;
  } | null;
  deltas: { total: number | null; rank: number | null } | null;
};

export type HistoryPayload = {
  ok: true;
  architecture: {
    mode: "shared-source";
    migrated: false;
    source: string;
    note: string;
  };
  fetchedAtUtc: string;
  fetchedAtBeijing: string;
  timezone: string;
  edition: { show: string | null; zone: string | null; term: string | null };
  collector: {
    lastCheckAt: string | null;
    lastSuccessAt: string | null;
    lastKind: string | null;
    cadenceMinutes: number | null;
    note: string | null;
  };
  counts: {
    snapshots: number;
    sourceTimes: number;
    anqi: number;
    huangcancan: number;
    sourceFrom: string | null;
    sourceTo: string | null;
  };
  artists: HistoryArtistView[];
  timeline: TimelineRow[];
  snapshots: HistorySnapshot[];
};

const ORIGIN_LABELS: Record<string, string> = {
  historical_observation: "历史人工观测（非实时）",
  manual_ingest: "人工入库（非实时）",
  public_html: "公开 HTML",
  public_direct: "公开直连",
};

export function formatShanghai(iso: string | null | undefined): string | null {
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

export function originLabel(origin: string | null | undefined, liveCollector: boolean | null | undefined): string {
  const base = origin ? ORIGIN_LABELS[origin] || origin : "出处未知";
  if (liveCollector === false && !base.includes("非实时")) return `${base}（非实时）`;
  return base;
}

export function displayCount(value: number | null | undefined): string {
  if (value == null) return "未提供";
  return value.toLocaleString("zh-CN");
}

export function displayRank(value: number | null | undefined): string {
  if (value == null) return "未提供";
  return String(value);
}

export function cellOrGap(snapshot: HistorySnapshot | null, field: "total" | "rank"): string {
  if (!snapshot) return "缺口";
  return field === "rank" ? displayRank(snapshot.rank) : displayCount(snapshot.total);
}

export function platformCell(snapshot: HistorySnapshot | null, key: keyof HistoryPlatforms): string {
  if (!snapshot) return "缺口";
  return displayCount(snapshot.platforms[key]);
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asArtistId(value: unknown): ArtistId | null {
  return value === "anqi" || value === "huangcancan" ? value : null;
}

function platformsOf(raw: unknown): HistoryPlatforms {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    aiLizhi: asNumberOrNull(row.aiLizhi),
    kugou: asNumberOrNull(row.kugou),
    qqMusic: asNumberOrNull(row.qqMusic),
  };
}

function provenanceOf(raw: unknown): HistoryProvenance {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    observer: asStringOrNull(row.observer),
    notes: asStringOrNull(row.notes),
    rawExcerpt: asStringOrNull(row.rawExcerpt),
    sourceId: asStringOrNull(row.sourceId),
  };
}

export function normalizeSnapshot(raw: unknown): HistorySnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const artistId = asArtistId(row.artistId);
  const sourceDisplayedUpdatedAt = asStringOrNull(row.sourceDisplayedUpdatedAt);
  if (!artistId || !sourceDisplayedUpdatedAt) return null;
  return {
    id: asStringOrNull(row.id) || `${artistId}::${sourceDisplayedUpdatedAt}`,
    artistId,
    total: asNumberOrNull(row.total),
    rank: asNumberOrNull(row.rank),
    platforms: platformsOf(row.platforms),
    sourceDisplayedUpdatedAt,
    collectedAt: asStringOrNull(row.collectedAt),
    origin: asStringOrNull(row.origin),
    liveCollector: typeof row.liveCollector === "boolean" ? row.liveCollector : null,
    provenance: provenanceOf(row.provenance),
  };
}

export function buildTimeline(snapshots: HistorySnapshot[]): TimelineRow[] {
  const bySource = new Map<string, TimelineRow>();
  for (const snap of snapshots) {
    let row = bySource.get(snap.sourceDisplayedUpdatedAt);
    if (!row) {
      row = {
        sourceDisplayedUpdatedAt: snap.sourceDisplayedUpdatedAt,
        sourceLabel: formatShanghai(snap.sourceDisplayedUpdatedAt) || snap.sourceDisplayedUpdatedAt,
        anqi: null,
        huangcancan: null,
      };
      bySource.set(snap.sourceDisplayedUpdatedAt, row);
    }
    const current = row[snap.artistId];
    if (!current || (snap.collectedAt || "") > (current.collectedAt || "")) {
      row[snap.artistId] = snap;
    }
  }
  return [...bySource.values()].sort((a, b) =>
    a.sourceDisplayedUpdatedAt < b.sourceDisplayedUpdatedAt ? 1 : -1,
  );
}

function artistView(raw: unknown, artistId: ArtistId, fallbackName: string, snapshots: HistorySnapshot[]): HistoryArtistView {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const freshness = row.freshness && typeof row.freshness === "object" ? (row.freshness as Record<string, unknown>) : null;
  const deltas = row.deltas && typeof row.deltas === "object" ? (row.deltas as Record<string, unknown>) : null;
  const latest = normalizeSnapshot(row.latest) || snapshots.find((item) => item.artistId === artistId) || null;
  return {
    artistId,
    displayName: asStringOrNull(row.displayName) || fallbackName,
    songTitle: asStringOrNull(row.songTitle),
    sampleCount: snapshots.filter((item) => item.artistId === artistId).length,
    latest,
    freshness: freshness
      ? {
          sourceUpdated: asStringOrNull(freshness.sourceUpdated),
          collected: asStringOrNull(freshness.collected),
          originLabel: asStringOrNull(freshness.originLabel),
          liveCollector: typeof freshness.liveCollector === "boolean" ? freshness.liveCollector : null,
        }
      : null,
    deltas: deltas ? { total: asNumberOrNull(deltas.total), rank: asNumberOrNull(deltas.rank) } : null,
  };
}

export function buildHistoryPayload(state: unknown, source = DEFAULT_STATE_URL): HistoryPayload {
  const root = state && typeof state === "object" ? (state as Record<string, unknown>) : {};
  const edition = root.edition && typeof root.edition === "object" ? (root.edition as Record<string, unknown>) : {};
  const collector = root.collector && typeof root.collector === "object" ? (root.collector as Record<string, unknown>) : {};
  const views = root.views && typeof root.views === "object" ? (root.views as Record<string, unknown>) : {};
  const snapshots = Array.isArray(root.snapshots)
    ? root.snapshots.map(normalizeSnapshot).filter((item): item is HistorySnapshot => item !== null)
    : [];
  const timeline = buildTimeline(snapshots);
  const collected = beijingNow();
  const sourceTimes = timeline.map((row) => row.sourceDisplayedUpdatedAt);
  return {
    ok: true,
    architecture: {
      mode: "shared-source",
      migrated: false,
      source,
      note: "只读共享 votes.alan0828.cloud 原数据库，不是复制搬库。",
    },
    fetchedAtUtc: collected.utc,
    fetchedAtBeijing: collected.beijing,
    timezone: asStringOrNull(root.timezone) || "Asia/Shanghai",
    edition: {
      show: asStringOrNull(edition.show),
      zone: asStringOrNull(edition.zone),
      term: asStringOrNull(edition.term),
    },
    collector: {
      lastCheckAt: asStringOrNull(collector.lastCheckAt),
      lastSuccessAt: asStringOrNull(collector.lastSuccessAt),
      lastKind: asStringOrNull(collector.lastKind),
      cadenceMinutes: asNumberOrNull(collector.cadenceMinutes),
      note: asStringOrNull(collector.note),
    },
    counts: {
      snapshots: snapshots.length,
      sourceTimes: timeline.length,
      anqi: snapshots.filter((item) => item.artistId === "anqi").length,
      huangcancan: snapshots.filter((item) => item.artistId === "huangcancan").length,
      sourceFrom: sourceTimes.at(-1) || null,
      sourceTo: sourceTimes[0] || null,
    },
    artists: [
      artistView(views.huangcancan, "huangcancan", "黄灿灿", snapshots),
      artistView(views.anqi, "anqi", "安崎", snapshots),
    ],
    timeline,
    snapshots,
  };
}

export async function loadSharedHistory(): Promise<HistoryPayload | { ok: false; error: string }> {
  const source = process.env.STATE_URL || DEFAULT_STATE_URL;
  try {
    const response = await fetch(source, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      return { ok: false, error: `shared source HTTP ${response.status}` };
    }
    const state: unknown = await response.json();
    return buildHistoryPayload(state, source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}
