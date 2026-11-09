import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { looksLikeRestriction, parseSongDetail, readTargetSongs } from "./parse-visible-chart";
import { platformsAllNumeric } from "./platform-miss";
import { DETAIL_PAGES, FINAL_URL, SCRAPE_BUDGET_MS, SOURCE_URL } from "./targets";
import { beijingNow } from "./time";
import type { PlatformVotes, ProbeResult, SongReading } from "./types";

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

async function launchBrowser() {
  if (process.env.VERCEL) {
    return puppeteer.launch({
      args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
      defaultViewport: VIEWPORT,
      executablePath: await chromium.executablePath(),
      headless: "shell",
    });
  }

  const executablePath = process.env.CHROME_PATH || "/usr/bin/google-chrome-stable";
  return puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
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

async function isolatedPage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await preparePage(page);
  return {
    page,
    close: async () => {
      await context.close().catch(() => undefined);
    },
  };
}

function emptyPlatforms(code: string): { platforms: PlatformVotes; platformMiss: string } {
  return { platforms: { ...EMPTY_PLATFORMS }, platformMiss: code };
}

async function readPublicSongDetail(
  browser: Browser,
  song: SongReading,
  deadline: number,
): Promise<{ platforms: PlatformVotes; platformMiss: string | null; note: string; screenshot?: Buffer }> {
  const remaining = deadline - Date.now();
  if (remaining < 12_000) {
    return { ...emptyPlatforms("timeout"), note: `${song.artist} 详情：剩余时间不足 ${remaining}ms，未打开详情。` };
  }

  const detail = DETAIL_PAGES[song.artistId];
  const isolated = await isolatedPage(browser);
  try {
    const response = await isolated.page.goto(detail.url, {
      waitUntil: "domcontentloaded",
      timeout: Math.min(25_000, Math.max(8_000, remaining - 4_000)),
    });
    const status = response?.status() ?? 0;
    if (status >= 400) {
      return { ...emptyPlatforms("detail_load_failed"), note: `${song.artist} 详情 HTTP ${status}。` };
    }

    const waitHydrated = async () => {
      await dismissNonVote(isolated.page);
      await isolated.page.waitForFunction(
        (title: string) => {
          const text = document.body?.innerText || "";
          return (
            text.includes(title) &&
            !text.includes("歌曲名称") &&
            /ai荔枝\s*[1-9][\d,]*\s*票/.test(text)
          );
        },
        { timeout: Math.min(14_000, Math.max(5_000, deadline - Date.now() - 3_000)) },
        song.title,
      );
    };
    try {
      await waitHydrated();
    } catch {
      await isolated.page.reload({ waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => undefined);
      await waitHydrated().catch(() => undefined);
    }
    await new Promise((r) => setTimeout(r, 600));
    await dismissNonVote(isolated.page);

    const text = await visibleText(isolated.page);
    const href = isolated.page.url();
    if (/人机验证|安全验证码|滑动验证/.test(text)) {
      return { ...emptyPlatforms("restriction"), note: `${song.artist} 详情出现验证码，已停止。 ${href}` };
    }
    if (/访问过于频繁|风控|异常访问/.test(text)) {
      return { ...emptyPlatforms("restriction"), note: `${song.artist} 详情出现风控提示，已停止。 ${href}` };
    }
    if ((/请登录|登录后查看/.test(text) && !/ai荔枝/.test(text)) || (/请登录/.test(text) && text.length < 80)) {
      return { ...emptyPlatforms("login_required"), note: `${song.artist} 详情需登录后才可见分项，已停止点击。` };
    }

    const parsed = parseSongDetail(text, song);
    if (!parsed.found) {
      return {
        ...emptyPlatforms("detail_load_failed"),
        note: `${song.artist} 详情页未见歌曲标题（textLen=${text.length} excerpt=${JSON.stringify(text.slice(0, 120))}）。`,
      };
    }
    const platformSum =
      (parsed.platforms.aiLizhi || 0) + (parsed.platforms.kugou || 0) + (parsed.platforms.qqMusic || 0);
    if (!platformsAllNumeric(parsed.platforms) || platformSum <= 0) {
      return {
        platforms: platformSum <= 0 ? { ...EMPTY_PLATFORMS } : parsed.platforms,
        platformMiss: "page_has_no_breakdown",
        note: `${song.artist} 详情页可见，但没有完整三端分项数字（textLen=${text.length}）。骨架屏 0 票不入库。`,
      };
    }
    await isolated.page.evaluate(() => {
      const node = [...document.querySelectorAll("div, span")].find((el) => (el.textContent || "").trim() === "ai荔枝");
      node?.scrollIntoView({ block: "center" });
    });
    const screenshot = Buffer.from(await isolated.page.screenshot({ type: "jpeg", quality: 55, fullPage: false }));
    const sum = parsed.platforms.aiLizhi! + parsed.platforms.kugou! + parsed.platforms.qqMusic!;
    return {
      platforms: parsed.platforms,
      platformMiss: null,
      note: `${song.artist} 详情页实读 ai荔枝=${parsed.platforms.aiLizhi} 酷狗=${parsed.platforms.kugou} QQ音乐=${parsed.platforms.qqMusic} 合计=${sum}${parsed.sourceUpdateText ? ` ${parsed.sourceUpdateText}` : ""}。`,
      screenshot,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = /timeout|Timeout/i.test(message);
    return {
      ...emptyPlatforms(timedOut ? "timeout" : "detail_load_failed"),
      note: `${song.artist} 详情${timedOut ? "超时" : "加载失败"}：${message}`,
    };
  } finally {
    await isolated.close();
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
    "总榜行只含排名/歌名/总票。三端来自公开歌曲详情短链的可见 DOM，不是总票成功就当完整采集。",
    "只读取可见 DOM/innerText；不监听网络、不调用未公开 API、不点击投票/去支持/确认投票。详情用独立浏览器上下文，避免总榜会话把明细页卡在白屏。",
  ];

  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await preparePage(page);

    const response = await page.goto(SOURCE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
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
          message: `公开页 HTTP ${status}，已停止。`,
        },
        screenshotJpegBase64: null,
        notes,
        rateLimit,
        ingest: null,
      };
    }

    await page.waitForFunction(
      () => document.body && document.body.innerText.includes("鲜打专区"),
      { timeout: 25_000 },
    );
    await new Promise((r) => setTimeout(r, 4_000));
    await dismissNonVote(page);
    await new Promise((r) => setTimeout(r, 600));

    await page.evaluate(() => {
      const nodes = [...document.querySelectorAll("div")];
      const zone = nodes
        .filter((n) => {
          const t = n.textContent || "";
          return t.includes("早上坏") && t.includes("Ice In My Walk") && t.includes("票") && t.length < 2500;
        })
        .sort((a, b) => (a.textContent || "").length - (b.textContent || "").length)[0];
      zone?.scrollIntoView({ block: "center" });
    });
    await new Promise((r) => setTimeout(r, 400));

    const chartText = await visibleText(page);
    const finalUrl = page.url() || FINAL_URL;
    const restriction = looksLikeRestriction(chartText);
    const parsedForDetails = readTargetSongs(chartText);
    const details: Array<{ platforms: PlatformVotes; platformMiss: string | null; note: string; screenshot?: Buffer }> = [];
    if (!restriction.kind) {
      for (const song of parsedForDetails.songs) {
        details.push(await readPublicSongDetail(browser, song, deadline));
      }
    }

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

    const parsed = parsedForDetails;
    const detailByArtist: Record<string, (typeof details)[number] | undefined> = {};
    parsed.songs.forEach((song, index) => {
      detailByArtist[song.artistId] = details[index];
    });
    const songs: SongReading[] = parsed.songs.map((song) => {
      const detail = detailByArtist[song.artistId] || { ...emptyPlatforms("not_attempted_detail"), note: `${song.artist} 详情未返回。` };
      notes.push(detail.note);
      if (!song.found) {
        notes.push(`${song.artist} 总榜行未见；总票成功不能当作三端成功。`);
        return { ...song, platformMiss: "not_attempted_detail" };
      }
      return {
        ...song,
        platforms: detail.platforms,
        platformMiss: detail.platformMiss,
      };
    });

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
