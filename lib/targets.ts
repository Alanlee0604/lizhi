import type { TargetSong } from "./types";

export const CHART_TITLE = "打歌2026·X舞台";
export const PERIOD = "第9期";
export const ZONE_NAME = "鲜打专区";

export const SOURCE_URL = "https://c6.y.qq.com/base/fcgi-bin/u?__=lp7YFbhAqlKw";
export const FINAL_URL =
  "https://yobang.tencentmusic.com/chart-h5/x-plan?ADTAG=cbshare&channelId=10036163&hosteuin=oiEz7eCl7K4q7n%2A%2A&openinqqmusic=1&shareFrom=qy";

export const TARGET_SONGS: TargetSong[] = [
  { id: "huangcancan-zaoshanghuai", artistId: "huangcancan", artist: "黄灿灿", title: "早上坏" },
  { id: "anqi-ice-in-my-walk", artistId: "anqi", artist: "安崎", title: "Ice In My Walk" },
];

/** User-provided public 三端详情入口. Identity is read from the visible DOM after the normal 302, not guessed from the slug. */
export const DETAIL_URLS = [
  "https://c6.y.qq.com/base/fcgi-bin/u?__=Al0gtgNAqK9e",
  "https://c6.y.qq.com/base/fcgi-bin/u?__=b40cE93Aqkgo",
] as const;

export const PROBE_TIMEOUT_MS = 110_000;
export const SCRAPE_BUDGET_MS = 95_000;
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const DEFAULT_INGEST_URL = "https://votes.alan0828.cloud/api/ingest";
export const DEFAULT_STATE_URL = "https://votes.alan0828.cloud/api/state";
