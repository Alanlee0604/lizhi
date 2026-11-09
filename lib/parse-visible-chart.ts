import { PERIOD, TARGET_SONGS, ZONE_NAME } from "./targets";
import type { PlatformVotes, SongReading } from "./types";

const PLATFORM_LABELS = {
  aiLizhi: ["ai荔枝", "荔枝"],
  kugou: ["酷狗"],
  qqMusic: ["QQ音乐", "qq音乐"],
} as const;

export function looksLikeRestriction(visibleText: string): {
  kind: "login" | "captcha" | "risk_control" | "chart_not_visible" | null;
  message: string;
} {
  if (/人机验证|安全验证码|滑动验证/.test(visibleText)) {
    return { kind: "captcha", message: "可见页面出现验证码/人机验证，已停止。" };
  }
  if (/访问过于频繁|风控|异常访问/.test(visibleText)) {
    return { kind: "risk_control", message: "可见页面出现风控提示，已停止。" };
  }
  const hasChart =
    visibleText.includes(ZONE_NAME) &&
    TARGET_SONGS.every((s) => visibleText.includes(s.title));
  if (!hasChart && /请登录|登录后查看榜单/.test(visibleText)) {
    return { kind: "login", message: "榜单不可见且出现登录墙，已停止。" };
  }
  if (!hasChart) {
    return { kind: "chart_not_visible", message: "公开页未见鲜打专区目标歌曲，已停止。" };
  }
  return { kind: null, message: "" };
}

export function extractFreshHitZone(visibleText: string): string | null {
  const marker = "榜单结果影响舞台演唱顺序选择权";
  const markerIdx = visibleText.indexOf(marker);
  if (markerIdx >= 0) {
    const start = visibleText.lastIndexOf(ZONE_NAME, markerIdx);
    let end = visibleText.length;
    for (const stop of ["榜单专属福利", "往期回顾"]) {
      const i = visibleText.indexOf(stop, markerIdx);
      if (i >= 0) end = Math.min(end, i);
    }
    return visibleText.slice(start >= 0 ? start : markerIdx, end);
  }

  const parts = visibleText.split(ZONE_NAME);
  for (let i = parts.length - 1; i >= 1; i -= 1) {
    if (parts[i].includes("票") && parts[i].includes(PERIOD)) {
      return `${ZONE_NAME}${parts[i].split("榜单专属福利")[0]}`;
    }
  }
  return null;
}

export function parseSourceUpdateText(zoneText: string): string | null {
  const match = zoneText.match(/更新至\s*([0-9]{1,2}:[0-9]{2})/);
  return match ? `更新至${match[1]}` : null;
}

function parseVoteNumber(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function parseSongRows(zoneText: string): Array<{
  rank: number | null;
  title: string;
  artist: string;
  totalVotes: number | null;
  block: string;
}> {
  const rows: Array<{
    rank: number | null;
    title: string;
    artist: string;
    totalVotes: number | null;
    block: string;
  }> = [];
  const re = /(\d+)\s*\n\s*(.+?)\s*\n\s*(.+?)\s*\n\s*([\d,]+)\s*\n\s*票/g;
  for (const match of zoneText.matchAll(re)) {
    rows.push({
      rank: Number(match[1]),
      title: match[2].trim(),
      artist: match[3].trim(),
      totalVotes: parseVoteNumber(match[4]),
      block: match[0],
    });
  }
  return rows;
}

export function parsePlatformVotes(block: string): PlatformVotes {
  const result: PlatformVotes = { aiLizhi: null, kugou: null, qqMusic: null };
  (Object.keys(PLATFORM_LABELS) as Array<keyof typeof PLATFORM_LABELS>).forEach((key) => {
    for (const label of PLATFORM_LABELS[key]) {
      const numbered = block.match(new RegExp(`${label}\\s*[:：]?\\s*([\\d,]+)`));
      if (numbered) {
        result[key] = parseVoteNumber(numbered[1]);
        return;
      }
      if (block.includes(label)) {
        result[key] = null;
        return;
      }
    }
  });
  return result;
}

export function parseDetailPlatformVotes(visibleText: string): PlatformVotes {
  const read = (pattern: RegExp): number | null => {
    const match = visibleText.match(pattern);
    return match ? parseVoteNumber(match[1]) : null;
  };
  return {
    aiLizhi: read(/ai\s*荔枝\s*[:：]?\s*([\d,]+)\s*票/i),
    kugou: read(/酷狗(?:音乐)?\s*[:：]?\s*([\d,]+)\s*票/),
    qqMusic: read(/QQ\s*音乐\s*[:：]?\s*([\d,]+)\s*票/i),
  };
}

export function identifyDetailTarget(visibleText: string): (typeof TARGET_SONGS)[number] | null {
  const hits = TARGET_SONGS.filter((target) => visibleText.includes(target.title) && visibleText.includes(target.artist));
  return hits.length === 1 ? hits[0] : null;
}

export function parseSongDetail(
  visibleText: string,
  target: { title: string; artist: string },
): {
  found: boolean;
  totalVotes: number | null;
  rank: number | null;
  sourceUpdateText: string | null;
  platforms: PlatformVotes;
} {
  const found = visibleText.includes(target.title) && visibleText.includes(target.artist);
  const afterTitle = found ? visibleText.slice(visibleText.indexOf(target.title)) : visibleText;
  const totalMatch = afterTitle.match(/([\d,]+)\s*\n\s*票/);
  const rankMatch = visibleText.match(/NO\.\s*(\d+)/i);
  const updated = visibleText.match(/(\d{1,2}:\d{2})\s*已更新/);
  return {
    found,
    totalVotes: totalMatch ? parseVoteNumber(totalMatch[1]) : null,
    rank: rankMatch && Number.isInteger(Number(rankMatch[1])) ? Number(rankMatch[1]) : null,
    sourceUpdateText: updated ? `更新至${updated[1]}` : null,
    platforms: parseDetailPlatformVotes(visibleText),
  };
}

export function readTargetSongs(visibleText: string): {
  zoneText: string | null;
  sourceUpdateText: string | null;
  songs: SongReading[];
} {
  const zoneText = extractFreshHitZone(visibleText);
  const sourceUpdateText = zoneText ? parseSourceUpdateText(zoneText) : parseSourceUpdateText(visibleText);
  const rows = zoneText ? parseSongRows(zoneText) : [];
  const songs = TARGET_SONGS.map((target) => {
    const row = rows.find(
      (item) => item.title === target.title && item.artist.includes(target.artist),
    );
    if (!row) {
      return {
        ...target,
        found: false,
        rank: null,
        totalVotes: null,
        platforms: { aiLizhi: null, kugou: null, qqMusic: null },
        platformMiss: "not_attempted_detail",
      };
    }
    return {
      ...target,
      found: true,
      rank: row.rank,
      totalVotes: row.totalVotes,
      platforms: parsePlatformVotes(row.block),
      platformMiss: "not_attempted_detail",
    };
  });
  return { zoneText, sourceUpdateText, songs };
}
