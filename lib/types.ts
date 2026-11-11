export type ArtistId = "anqi" | "huangcancan";

export type PlatformVotes = {
  aiLizhi: number | null;
  kugou: number | null;
  qqMusic: number | null;
};

export type TargetSong = {
  id: string;
  artistId: ArtistId;
  artist: string;
  title: string;
};

export type SongReading = {
  id: string;
  artistId: ArtistId;
  artist: string;
  title: string;
  found: boolean;
  rank: number | null;
  totalVotes: number | null;
  platforms: PlatformVotes;
  platformMiss: string | null;
  sourceUpdateText?: string | null;
};

export type Restriction = {
  stopped: true;
  kind: "login" | "captcha" | "risk_control" | "timeout" | "chart_not_visible" | "other";
  message: string;
};

export type RateLimitInfo = {
  limit: string;
  retryAfterSeconds: number;
};

export type IngestResult = {
  attempted: boolean;
  ok: boolean;
  skipped: boolean;
  reason: string | null;
  status: number | null;
  body: string | null;
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
  rateLimit: RateLimitInfo;
  ingest: IngestResult | null;
};

export type ProbeFailure = {
  ok: false;
  layer: "vercel-function-chromium";
  collectedAtUtc: string;
  collectedAtBeijing: string;
  restriction: Restriction;
  screenshotJpegBase64: string | null;
  notes: string[];
  rateLimit: RateLimitInfo;
  ingest: IngestResult | null;
};

export type ProbeResult = ProbeSuccess | ProbeFailure;
