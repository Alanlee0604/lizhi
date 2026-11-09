import type { TargetSong } from "./types";

export const CHART_TITLE = "打歌2026·X舞台";
export const PERIOD = "第9期";
export const ZONE_NAME = "鲜打专区";

export const SOURCE_URL = "https://c6.y.qq.com/base/fcgi-bin/u?__=lp7YFbhAqlKw";
export const FINAL_URL =
  "https://yobang.tencentmusic.com/chart-h5/x-plan?ADTAG=cbshare&channelId=10036163&hosteuin=oiEz7eCl7K4q7n%2A%2A&openinqqmusic=1&shareFrom=qy";

export const TARGET_SONGS: TargetSong[] = [
  { id: "huangcancan-zaoshanghuai", artist: "黄灿灿", title: "早上坏" },
  { id: "anqi-ice-in-my-walk", artist: "安崎", title: "Ice In My Walk" },
];

export const MAX_MANUAL_PROBES = 2;
export const PROBE_TIMEOUT_MS = 90_000;
