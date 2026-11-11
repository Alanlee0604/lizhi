import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import {
  assembleSongs,
  isDeadBrowserError,
  keepParsedDetail,
  probeHasPersistableSongs,
  type CapturedDetail,
} from "./assemble-probe";
import { allocateDetailSlots, platformsHydrated, slotDeadline } from "./detail-assign";
import { identifyDetailTarget, looksLikeRestriction, parseSongDetail, readTargetSongs } from "./parse-visible-chart";
import { platformsAllNumeric } from "./platform-miss";
import { DETAIL_URLS, FINAL_URL, SCRAPE_BUDGET_MS, SOURCE_URL, TARGET_SONGS } from "./targets";
import { beijingNow } from "./time";
import type { PlatformVotes, ProbeFailure, ProbeResult, ProbeSuccess } from "./types";

const CHROME_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const DISMISS_ONLY = ["取消", "关闭", "跳过", "暂不", "继续浏览", "留在浏览器"];
const FORBIDDEN_CLICK = [
  "去支持",
  "推荐",
  "参加活动",
  "抽取福利",
  "投票",
  "确认投票",
  "去攒票",
  "为TA投票",
];

const EMPTY_PLATFORMS: PlatformVotes = { aiLizhi: null, kugou: null, qqMusic: null };
const VIEWPORT = { width: 1280, height: 900 };
const EXTRA_ARGS = ["--disable-http2", "--no-sandbox", "--disable-gpu"];

const MAX_RELAUNCHES = 1;
const RELAUNCH_MIN_REMAINING_MS = 8_000;

type DetailRead = CapturedDetail & { screenshot?: Buffer };

type BrowserState = {
  browser: Browser | null;
  relaunches: number;
};

function emptyDetail(url: string, miss: string, note: string): DetailRead {
  return {
    url,
    artistId: null,
    artist: null,
    title: null,
    platforms: { ...EMPTY_PLATFORMS },
    platformMiss: miss,
    note,
    totalVotes: null,
    rank: null,
    sourceUpdateText: null,
  };
}

async function launchBrowser() {
  if (process.env.VERCEL) {
    return puppeteer.launch({
      args: await puppeteer.defaultArgs({ args: [...chromium.args, ...EXTRA_ARGS], headless: "shell" }),
      defaultViewport: VIEWPORT,
      executablePath: await chromium.executablePath(),
      headless: "shell",
    });
  }

  const executablePath = process.env.CHROME_PATH || "/usr/bin/google-chrome-stable";
  return puppeteer.launch({
    executablePath,
    headless: true,
    args: [...EXTRA_ARGS, `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
    defaultViewport: VIEWPORT,
  });
}

async function preparePage(page: Page) {
  await page.setUserAgent(CHROME_UA);
  await page.emulateTimezone("Asia/Shanghai");
}

async function dismissNonVote(page: Page) {
  await page.evaluate(
    (dismiss, forbidden) => {
      const clickable = [...document.querySelectorAll("button, a, div, span")];
      for (const node of clickable) {
        const text = (node.textContent || "").trim();
        if (forbidden.some((item) => text.includes(item))) continue;
        if (dismiss.includes(text) || text === "×" || text === "X") {
          (node as HTMLElement).click();
        }
      }
    },
    DISMISS_ONLY,
    FORBIDDEN_CLICK,
  );
}

async function visibleText(page: Page): Promise<string> {
  return page.evaluate(() => document.body?.innerText || "");
}

async function gotoWithRetry(page: Page, url: string, timeout: number) {
  try {
    return await page.goto(url, { waitUntil: "domcontentloaded", timeout });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/EMPTY_RESPONSE|HTTP2|ERR_CONNECTION|net::ERR|Frame detached|Target closed/i.test(message)) throw error;
    await new Promise((r) => setTimeout(r, 800));
    return page.goto(url, { waitUntil: "domcontentloaded", timeout });
  }
}

async function waitHydrated(page: Page, timeout: number) {
  await dismissNonVote(page);
  await page.waitForFunction(
    (titles: string[]) => {
      const text = document.body?.innerText || "";
      const named = titles.some((title) => text.includes(title));
      const positive = (pattern: string) => {
        const match = text.match(new RegExp(pattern));
        const value = match ? Number(String(match[1]).replace(/,/g, "")) : 0;
        return Number.isFinite(value) && value > 0;
      };
      return (
        named &&
        positive("ai\\s*荔枝\\s*[:：]?\\s*([\\d,]+)\\s*票") &&
        positive("酷狗(?:音乐)?\\s*[:：]?\\s*([\\d,]+)\\s*票") &&
        positive("QQ\\s*音乐\\s*[:：]?\\s*([\\d,]+)\\s*票")
      );
    },
    { timeout },
    TARGET_SONGS.map((song) => song.title),
  );
}

async function ensureBrowser(state: BrowserState, deadline: number, notes: string[]): Promise<Browser | null> {
  if (state.browser?.connected) return state.browser;
  const remaining = deadline - Date.now();
  if (remaining < RELAUNCH_MIN_REMAINING_MS) return null;
  const isRelaunch = state.browser != null || state.relaunches > 0;
  if (isRelaunch && state.relaunches >= MAX_RELAUNCHES) return null;
  if (state.browser) await state.browser.close().catch(() => undefined);
  state.browser = await launchBrowser();
  if (isRelaunch) {
    state.relaunches += 1;
    notes.push(
      `浏览器已断开，有界重启 ${state.relaunches}/${MAX_RELAUNCHES}，避免把 95s 预算耗在无限重试。`,
    );
  }
  return state.browser?.connected ? state.browser : null;
}

async function optionalScreenshot(page: Page): Promise<{ buffer?: Buffer; error?: string }> {
  try {
    const buffer = Buffer.from(await page.screenshot({ type: "jpeg", quality: 55, fullPage: false }));
    return { buffer };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: message };
  }
}

async function readPublicDetailUrl(
  browser: Browser,
  url: string,
  deadline: number,
  includeScreenshot: boolean,
): Promise<DetailRead> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    return emptyDetail(url, "timeout", `${url} 本槽时限已用尽，详情未读完。`);
  }

  let page: Page | null = null;
  let parsed: DetailRead | null = null;
  try {
    page = await browser.newPage();
    await preparePage(page);
    const response = await gotoWithRetry(page, url, Math.min(16_000, Math.max(4_000, remaining - 16_000)));
    const status = response?.status() ?? 0;
    if (status >= 400) {
      return emptyDetail(url, "detail_load_failed", `${url} 详情 HTTP ${status}。`);
    }

    const hydrateMs = Math.min(12_000, Math.max(3_000, deadline - Date.now() - 4_000));
    try {
      await waitHydrated(page, hydrateMs);
    } catch {
      const reloadMs = Math.min(8_000, Math.max(0, deadline - Date.now() - 4_000));
      if (reloadMs > 1_000) {
        await page.reload({ waitUntil: "domcontentloaded", timeout: reloadMs }).catch(() => undefined);
        const secondHydrate = Math.min(10_000, Math.max(0, deadline - Date.now() - 1_000));
        if (secondHydrate > 1_000) await waitHydrated(page, secondHydrate).catch(() => undefined);
      }
    }
    await new Promise((r) => setTimeout(r, 600));
    await dismissNonVote(page);

    const text = await visibleText(page);
    const href = page.url();
    if (/人机验证|安全验证码|滑动验证/.test(text)) {
      return emptyDetail(url, "restriction", `${url} 详情出现验证码，已停止。 ${href}`);
    }
    if (/访问过于频繁|风控|异常访问/.test(text)) {
      return emptyDetail(url, "restriction", `${url} 详情出现风控提示，已停止。 ${href}`);
    }
    if ((/请登录|登录后查看/.test(text) && !/ai荔枝/.test(text)) || (/请登录/.test(text) && text.length < 80)) {
      return emptyDetail(url, "login_required", `${url} 详情需登录后才可见分项，已停止点击。`);
    }

    const target = identifyDetailTarget(text);
    if (!target) {
      return emptyDetail(
        url,
        "detail_unidentified",
        `${url} 终页未见安崎或黄灿灿歌名（textLen=${text.length} excerpt=${JSON.stringify(text.slice(0, 120))}）。`,
      );
    }
    const song = parseSongDetail(text, target);
    const platformSum =
      (song.platforms.aiLizhi || 0) + (song.platforms.kugou || 0) + (song.platforms.qqMusic || 0);
    const hydrated = platformsHydrated(song.platforms);
    parsed = {
      url,
      artistId: target.artistId,
      artist: target.artist,
      title: target.title,
      platforms: hydrated ? song.platforms : { ...EMPTY_PLATFORMS },
      platformMiss: hydrated ? null : "page_has_no_breakdown",
      totalVotes: song.totalVotes,
      rank: song.rank,
      sourceUpdateText: song.sourceUpdateText,
      note: hydrated
        ? `${url} 终页实读 ${target.artist}《${target.title}》 ai荔枝=${song.platforms.aiLizhi} 酷狗=${song.platforms.kugou} QQ音乐=${song.platforms.qqMusic} 合计=${platformSum}${song.sourceUpdateText ? ` ${song.sourceUpdateText}` : ""}。`
        : `${url} 已识别 ${target.artist}《${target.title}》，但没有完整三端分项（骨架屏 0 票不入库）。`,
    };
    await page
      .evaluate(() => {
        const node = [...document.querySelectorAll("div, span")].find((el) => (el.textContent || "").trim() === "ai荔枝");
        node?.scrollIntoView({ block: "center" });
      })
      .catch(() => undefined);
    if (includeScreenshot) {
      const shot = await optionalScreenshot(page);
      if (shot.buffer) parsed.screenshot = shot.buffer;
      if (shot.error) parsed = keepParsedDetail(parsed, shot.error);
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (parsed) return keepParsedDetail(parsed, message);
    const timedOut = /timeout|Timeout/i.test(message);
    const dead = isDeadBrowserError(message);
    return emptyDetail(
      url,
      timedOut ? "timeout" : "detail_load_failed",
      `${url} 详情${timedOut ? "超时" : dead ? "页崩溃/协议错误" : "加载失败"}：${message}`,
    );
  } finally {
    if (page) await page.close().catch(() => undefined);
  }
}

function failureResult(
  collected: { utc: string; beijing: string },
  notes: string[],
  rateLimit: ProbeFailure["rateLimit"],
  message: string,
  timedOut: boolean,
): ProbeFailure {
  return {
    ok: false,
    layer: "vercel-function-chromium",
    collectedAtUtc: collected.utc,
    collectedAtBeijing: collected.beijing,
    restriction: {
      stopped: true,
      kind: timedOut ? "timeout" : "other",
      message: timedOut ? `渲染超时，已停止：${message}` : `采集失败，已停止：${message}`,
    },
    screenshotJpegBase64: null,
    notes,
    rateLimit,
    ingest: null,
  };
}

function successFromParts(input: {
  collected: { utc: string; beijing: string };
  notes: string[];
  rateLimit: ProbeSuccess["rateLimit"];
  songs: ProbeSuccess["songs"];
  sourceUpdateText: string | null;
  finalUrl: string;
  screenshotJpegBase64: string | null;
}): ProbeSuccess {
  return {
    ok: true,
    layer: "vercel-function-chromium",
    chartTitle: "打歌2026·X舞台",
    period: "第9期",
    zoneName: "鲜打专区",
    sourceUrl: SOURCE_URL,
    finalUrl: input.finalUrl,
    sourceUpdateText: input.sourceUpdateText,
    collectedAtUtc: input.collected.utc,
    collectedAtBeijing: input.collected.beijing,
    songs: input.songs,
    restriction: null,
    screenshotJpegBase64: input.screenshotJpegBase64,
    notes: input.notes,
    rateLimit: input.rateLimit,
    ingest: null,
  };
}

export async function scrapeVisibleChart(options: {
  includeScreenshot?: boolean;
  rateLimit: { limit: string; retryAfterSeconds: number };
}): Promise<ProbeResult> {
  const collected = beijingNow();
  const rateLimit = options.rateLimit;
  const deadline = Date.now() + SCRAPE_BUDGET_MS;
  const notes: string[] = [
    "layer=vercel-function-chromium：浏览器在已部署的 Vercel Function 进程内启动，不是 Vercel Sandbox 会话。",
    "三端只从用户给出的两条公开详情短链读取可见 DOM；身份按终页歌名/歌手绑定，不按 slug 猜测。",
    "不点击总榜「去支持」/歌曲行。总榜弹层是 QQ音乐/酷狗/酷我参与选择，不是分项详情。",
    "不监听网络、不调用未公开 API、不点击确认投票/去攒票。",
    "单页或截图失败不丢已读数字；总榜失败仍会尝试入库已有身份和源时间的详情。",
  ];
  const includeScreenshot = options.includeScreenshot === true;
  const state: BrowserState = { browser: null, relaunches: 0 };
  const details: DetailRead[] = [];

  const finishWithDetails = (
    chartSongs: ReturnType<typeof readTargetSongs>["songs"] | null,
    chartSourceUpdateText: string | null,
    chartError: string | null,
    finalUrl: string,
    extraNotes: string[] = [],
  ): ProbeResult => {
    notes.push(...extraNotes);
    const assembled = assembleSongs({
      chartSongs,
      chartSourceUpdateText,
      details,
      chartError,
    });
    notes.push(...assembled.notes);
    for (const song of assembled.songs) {
      if (!song.found) notes.push(`${song.artist} 本轮未见可入库总票；不拿邻时或另一人的数填缺口。`);
    }
    for (const target of TARGET_SONGS) {
      const bound = details.some((detail) => detail.artistId === target.artistId);
      if (!bound) {
        notes.push(`${target.artist} 详情短链可见 DOM 未识别到该人，已把该 URL 的真实缺失原因绑到此人。`);
      }
    }
    if (assembled.songs.some((song) => !platformsAllNumeric(song.platforms))) {
      notes.push("至少一首目标歌曲三端未采集到；缺失原因已写入 platformMiss / obsj.miss，不断言腾讯未提供。");
    }
    if (!probeHasPersistableSongs(assembled.songs)) {
      return failureResult(collected, notes, rateLimit, chartError || "本轮没有可入库的真实总票", /timeout/i.test(chartError || ""));
    }
    const shot = includeScreenshot ? details.find((item) => item.screenshot)?.screenshot : undefined;
    return successFromParts({
      collected,
      notes,
      rateLimit,
      songs: assembled.songs,
      sourceUpdateText: assembled.sourceUpdateText,
      finalUrl,
      screenshotJpegBase64: shot ? shot.toString("base64") : null,
    });
  };

  try {
    state.browser = await launchBrowser();
    const { perDetailMs } = allocateDetailSlots({ urlCount: DETAIL_URLS.length });
    notes.push(`详情按 URL 均分时限 ${perDetailMs}ms，不把第一首的剩余时间留给第二首。`);

    for (const url of DETAIL_URLS) {
      const browser = await ensureBrowser(state, deadline, notes);
      if (!browser) {
        details.push(emptyDetail(url, "timeout", `${url} 浏览器不可用且重启预算已用尽，跳过该详情。`));
        notes.push(details[details.length - 1]!.note);
        continue;
      }
      const detail = await readPublicDetailUrl(
        browser,
        url,
        slotDeadline(Date.now(), perDetailMs),
        includeScreenshot,
      );
      details.push(detail);
      notes.push(detail.note);
    }

    let chartError: string | null = null;
    let chartSongs: ReturnType<typeof readTargetSongs>["songs"] | null = null;
    let chartSourceUpdateText: string | null = null;
    let finalUrl = FINAL_URL;
    const browser = await ensureBrowser(state, deadline, notes);
    if (!browser) {
      chartError = "总榜前浏览器已断开，重启预算已用尽。";
    } else {
      const page = await browser.newPage();
      await preparePage(page);
      try {
        const chartTimeout = Math.max(8_000, Math.min(22_000, deadline - Date.now()));
        const response = await gotoWithRetry(page, SOURCE_URL, chartTimeout);
        const status = response?.status() ?? 0;
        if (status >= 400) {
          chartError = `公开榜 HTTP ${status}`;
        } else {
          await page.waitForFunction(
            () => document.body && document.body.innerText.includes("鲜打专区"),
            { timeout: Math.min(12_000, Math.max(4_000, deadline - Date.now())) },
          );
          await new Promise((r) => setTimeout(r, Math.min(2_000, Math.max(0, deadline - Date.now() - 1_000))));
          await dismissNonVote(page);
          const chartText = await visibleText(page);
          finalUrl = page.url() || FINAL_URL;
          const restriction = looksLikeRestriction(chartText);
          if (restriction.kind) {
            notes.push(`总榜限制：${restriction.message}；已读详情仍尝试入库。`);
            chartError = restriction.message;
          } else {
            const parsed = readTargetSongs(chartText);
            chartSongs = parsed.songs;
            chartSourceUpdateText = parsed.sourceUpdateText;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        chartError = message;
      } finally {
        await page.close().catch(() => undefined);
      }
    }

    return finishWithDetails(chartSongs, chartSourceUpdateText, chartError, finalUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    notes.push(`采集外层错误：${message}`);
    const recovered = finishWithDetails(null, null, message, FINAL_URL);
    if (recovered.ok) return recovered;
    return failureResult(collected, notes, rateLimit, message, /timeout|Timeout/i.test(message));
  } finally {
    if (state.browser) {
      await state.browser.close().catch(() => undefined);
    }
  }
}
