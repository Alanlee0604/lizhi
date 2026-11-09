export type PlatformVotes = {
  lizhi: number | null;
  kugou: number | null;
  qqMusic: number | null;
};

export type TargetSong = {
  id: string;
  artist: string;
  title: string;
};

export type SongReading = {
  id: string;
  artist: string;
  title: string;
  found: boolean;
  rank: number | null;
  totalVotes: number | null;
  platforms: PlatformVotes;
};

export type Restriction = {
  stopped: true;
  kind: "login" | "captcha" | "risk_control" | "timeout" | "chart_not_visible" | "other";
  message: string;
};

export type ProbeSuccess = {
  ok: true;
  layer: "vercel-function-chromium";
  chartTitle: string;
  period: string;
  zoneName: string;
  sourceUrl: string;
  finalUrl: string;
  sourceUpdateText: string | null;
  collectedAtUtc: string;
  collectedAtBeijing: string;
  songs: SongReading[];
  restriction: null;
  screenshotJpegBase64: string | null;
  notes: string[];
  probeRemaining: number;
};

export type ProbeFailure = {
  ok: false;
  layer: "vercel-function-chromium";
  collectedAtUtc: string;
  collectedAtBeijing: string;
  restriction: Restriction;
  probeRemaining: number;
  screenshotJpegBase64: string | null;
  notes: string[];
};

export type ProbeResult = ProbeSuccess | ProbeFailure;
