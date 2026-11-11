import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { allocateDetailSlots, assignDetailsToSongs, platformsHydrated, slotDeadline } from "./detail-assign";
import { identifyDetailTarget, looksLikeRestriction, parseSongDetail, readTargetSongs } from "./parse-visible-chart";
import { platformsAllNumeric } from "./platform-miss";
import { DETAIL_URLS, FINAL_URL, SCRAPE_BUDGET_MS, SOURCE_URL, TARGET_SONGS } from "./targets";
import { beijingNow } from "./time";
import type { ArtistId, PlatformVotes, ProbeResult, SongReading } from "./types";

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

type DetailRead = {
  url: string;
  artistId: ArtistId | null;
  artist: string | null;
  title: string | null;
  platforms: PlatformVotes;
  platformMiss: string | null;
  note: string;
  screenshot?: Buffer;
};

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

function emptyPlatforms(code: string): { platforms: PlatformVotes; platformMiss: string } {
  return { platforms: { ...EMPTY_PLATFORMS }, platformMiss: code };
}

async function gotoWithRetry(page: Page, url: string, timeout: number) {
  try {
    return await page.goto(url, { waitUntil: "domcontentloaded", timeout });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/EMPTY_RESPONSE|HTTP2|ERR_CONNECTION|net::ERR/i.test(message)) throw error;
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

async function readPublicDetailUrl(browser: Browser, url: string, deadline: number): Promise<DetailRead> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    return {
      url,
      artistId: null,
      artist: null,
      title: null,
      ...emptyPlatforms("timeout"),
      note: `${url} 本槽时限已用尽，详情未读完。`,
    };
  }

  const page = await browser.newPage();
  await preparePage(page);
  try {
        const response = await gotoWithRetry(page, url, Math.min(16_000, Math.max(4_000, remaining - 16_000)));
    const status = response?.status() ?? 0;
    if (status >= 400) {
      return {
        url,
        artistId: null,
        artist: null,
        title: null,
        ...emptyPlatforms("detail_load_failed"),
        note: `${url} 详情 HTTP ${status}。`,
      };
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
      return { url, artistId: null, artist: null, title: null, ...emptyPlatforms("restriction"), note: `${url} 详情出现验证码，已停止。 ${href}` };
    }
    if (/访问过于频繁|风控|异常访问/.test(text)) {
      return { url, artistId: null, artist: null, title: null, ...emptyPlatforms("restriction"), note: `${url} 详情出现风控提示，已停止。 ${href}` };
    }
    if ((/请登录|登录后查看/.test(text) && !/ai荔枝/.test(text)) || (/请登录/.test(text) && text.length < 80)) {
      return { url, artistId: null, artist: null, title: null, ...emptyPlatforms("login_required"), note: `${url} 详情需登录后才可见分项，已停止点击。` };
    }

    const target = identifyDetailTarget(text);
    if (!target) {
      return {
        url,
        artistId: null,
        artist: null,
        title: null,
        ...emptyPlatforms("detail_unidentified"),
        note: `${url} 终页未见安崎或黄灿灿歌名（textLen=${text.length} excerpt=${JSON.stringify(text.slice(0, 120))}）。`,
      };
    }
    const parsed = parseSongDetail(text, target);
    const platformSum =
      (parsed.platforms.aiLizhi || 0) + (parsed.platforms.kugou || 0) + (parsed.platforms.qqMusic || 0);
    if (!platformsHydrated(parsed.platforms)) {
      return {
        url,
        artistId: target.artistId,
        artist: target.artist,
        title: target.title,
        platforms: { ...EMPTY_PLATFORMS },
        platformMiss: "page_has_no_breakdown",
        note: `${url} 已识别 ${target.artist}《${target.title}》，但没有完整三端分项（骨架屏 0 票不入库）。`,
      };
    }
    await page.evaluate(() => {
      const node = [...document.querySelectorAll("div, span")].find((el) => (el.textContent || "").trim() === "ai荔枝");
      node?.scrollIntoView({ block: "center" });
    });
    const screenshot = Buffer.from(await page.screenshot({ type: "jpeg", quality: 55, fullPage: false }));
    return {
      url,
      artistId: target.artistId,
      artist: target.artist,
      title: target.title,
      platforms: parsed.platforms,
      platformMiss: null,
      note: `${url} 终页实读 ${target.artist}《${target.title}》 ai荔枝=${parsed.platforms.aiLizhi} 酷狗=${parsed.platforms.kugou} QQ音乐=${parsed.platforms.qqMusic} 合计=${platformSum}${parsed.sourceUpdateText ? ` ${parsed.sourceUpdateText}` : ""}。`,
      screenshot,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = /timeout|Timeout/i.test(message);
    return {
      url,
      artistId: null,
      artist: null,
      title: null,
      ...emptyPlatforms(timedOut ? "timeout" : "detail_load_failed"),
      note: `${url} 详情${timedOut ? "超时" : "加载失败"}：${message}`,
    };
  } finally {
    await page.close().catch(() => undefined);
  }
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
  ];

  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;
  try {
    browser = await launchBrowser();

    const { perDetailMs } = allocateDetailSlots({ urlCount: DETAIL_URLS.length });
    notes.push(`详情按 URL 均分时限 ${perDetailMs}ms，不把第一首的剩余时间留给第二首。`);
    const details: DetailRead[] = [];
    for (const url of DETAIL_URLS) {
      details.push(await readPublicDetailUrl(browser, url, slotDeadline(Date.now(), perDetailMs)));
    }
    for (const detail of details) notes.push(detail.note);

    const page = await browser.newPage();
    await preparePage(page);
    const chartTimeout = Math.max(8_000, Math.min(45_000, deadline - Date.now()));
    const response = await gotoWithRetry(page, SOURCE_URL, chartTimeout);
    const status = response?.status() ?? 0;
    if (status >= 400) {
      return {
        ok: false,
        layer: "vercel-function-chromium",
        collectedAtUtc: collected.utc,
        collectedAtBeijing: collected.beijing,
        restriction: {
          stopped: true,
          kind: "other",
          message: `公开榜 HTTP ${status}，已停止。`,
        },
        screenshotJpegBase64: null,
        notes,
        rateLimit,
        ingest: null,
      };
    }

    await page.waitForFunction(
      () => document.body && document.body.innerText.includes("鲜打专区"),
      { timeout: Math.min(25_000, Math.max(5_000, deadline - Date.now())) },
    );
    await new Promise((r) => setTimeout(r, 4_000));
    await dismissNonVote(page);
    await new Promise((r) => setTimeout(r, 400));

    const chartText = await visibleText(page);
    const finalUrl = page.url() || FINAL_URL;
    const restriction = looksLikeRestriction(chartText);
    if (restriction.kind) {
      let screenshotJpegBase64: string | null = null;
      if (options.includeScreenshot) {
        const screenshot = await page.screenshot({ type: "jpeg", quality: 55, fullPage: false });
        screenshotJpegBase64 = Buffer.from(screenshot).toString("base64");
      }
      return {
        ok: false,
        layer: "vercel-function-chromium",
        collectedAtUtc: collected.utc,
        collectedAtBeijing: collected.beijing,
        restriction: { stopped: true, kind: restriction.kind, message: restriction.message },
        screenshotJpegBase64,
        notes,
        rateLimit,
        ingest: null,
      };
    }

    const parsed = readTargetSongs(chartText);
    const songs: SongReading[] = assignDetailsToSongs(parsed.songs, details).map((song) => {
      if (!song.found) {
        notes.push(`${song.artist} 总榜行未见；总票成功不能当作三端成功。`);
      }
      return song;
    });

    for (const target of TARGET_SONGS) {
      const bound = details.some((detail) => detail.artistId === target.artistId);
      if (!bound) {
        notes.push(`${target.artist} 详情短链可见 DOM 未识别到该人，已把该 URL 的真实缺失原因绑到此人，不再写成未尝试。`);
      }
    }
    if (songs.some((song) => !platformsAllNumeric(song.platforms))) {
      notes.push("至少一首目标歌曲三端未采集到；缺失原因已写入 platformMiss / obsj.miss，不断言腾讯未提供。");
    }

    let screenshotJpegBase64: string | null = null;
    if (options.includeScreenshot) {
      const detailShot = details.find((item) => item.screenshot)?.screenshot;
      const screenshot = detailShot || Buffer.from(await page.screenshot({ type: "jpeg", quality: 55, fullPage: false }));
      screenshotJpegBase64 = screenshot.toString("base64");
    }

    return {
      ok: true,
      layer: "vercel-function-chromium",
      chartTitle: "打歌2026·X舞台",
      period: "第9期",
      zoneName: "鲜打专区",
      sourceUrl: SOURCE_URL,
      finalUrl,
      sourceUpdateText: parsed.sourceUpdateText,
      collectedAtUtc: collected.utc,
      collectedAtBeijing: collected.beijing,
      songs,
      restriction: null,
      screenshotJpegBase64,
      notes,
      rateLimit,
      ingest: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = /timeout|Timeout/i.test(message);
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
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}
