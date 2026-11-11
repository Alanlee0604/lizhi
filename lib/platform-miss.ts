export const PLATFORM_MISS = {
  not_attempted_detail: "未尝试打开歌曲详情页",
  detail_load_failed: "详情页加载失败",
  detail_unidentified: "详情页已打开，但未见对应歌手/歌名",
  login_required: "详情页需登录后才可见分项",
  page_has_no_breakdown: "详情页可见，但没有三端分项数字",
  timeout: "详情读取超时",
  restriction: "详情页出现验证码或风控",
  unstructured_total_only: "该轮只记录了总票，未尝试读取详情",
} as const;

export type PlatformMissCode = keyof typeof PLATFORM_MISS;

export function platformMissLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  if (code in PLATFORM_MISS) return PLATFORM_MISS[code as PlatformMissCode];
  return code;
}

export function platformsAllNumeric(platforms: { aiLizhi: number | null; kugou: number | null; qqMusic: number | null }): boolean {
  return [platforms.aiLizhi, platforms.kugou, platforms.qqMusic].every(
    (value) => typeof value === "number" && Number.isFinite(value) && value > 0,
  );
}
