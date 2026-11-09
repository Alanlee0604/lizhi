import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { FINAL_URL, SOURCE_URL } from "./targets";
import { looksLikeRestriction, readTargetSongs } from "./parse-visible-chart";
import { beijingNow } from "./time";
import type { ProbeResult } from "./types";

const CHROME_MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36";

const DISMISS_ONLY = ["取消", "关闭", "跳过", "暂不", "继续浏览", "留在浏览器"];
const FORBIDDEN_CLICK = ["去支持", "推荐", "参加活动", "抽取福利", "投票"];

async function launchBrowser() {
  const viewport = { width: 390, height: 844, isMobile: true, hasTouch: true as const };

  if (process.env.VERCEL) {
    return puppeteer.launch({
      args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
      defaultViewport: viewport,
      executablePath: await chromium.executablePath(),
      headless: "shell",
    });
  }

  const executablePath = process.env.CHROME_PATH || "/usr/bin/google-chrome-stable";
  return puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--window-size=390,844"],
    defaultViewport: viewport,
  });
}

export async function scrapeVisibleChart(options: {
  includeScreenshot?: boolean;
  rateLimit: { limit: string; retryAfterSeconds: number };
}): Promise<ProbeResult> {
  const collected = beijingNow();
  const rateLimit = options.rateLimit;
  const notes: string[] = [
    "layer=vercel-function-chromium：浏览器在已部署的 Vercel Function 进程内启动，不是 Vercel Sandbox 会话。",
    "只读取可见 DOM/innerText；不监听网络、不调用未公开 API、不点击投票/去支持。",
    "三平台分项仅当公开页对应该歌曲可见数字时填写；缺失为 null。",
  ];

  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setUserAgent(CHROME_MOBILE_UA);

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
    await new Promise((r) => setTimeout(r, 6_000));

    await page.evaluate((dismiss, forbidden) => {
      const clickable = [...document.querySelectorAll("button, a, div, span")];
      for (const node of clickable) {
        const text = (node.textContent || "").trim();
        if (forbidden.some((item) => text.includes(item))) continue;
        if (dismiss.includes(text) || text === "×" || text === "X") {
          (node as HTMLElement).click();
        }
      }
    }, DISMISS_ONLY, FORBIDDEN_CLICK);

    await new Promise((r) => setTimeout(r, 1_000));

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
    await new Promise((r) => setTimeout(r, 500));

    const visibleText = await page.evaluate(() => document.body?.innerText || "");
    const finalUrl = page.url() || FINAL_URL;
    const restriction = looksLikeRestriction(visibleText);
    let screenshotJpegBase64: string | null = null;
    if (options.includeScreenshot) {
      const screenshot = await page.screenshot({ type: "jpeg", quality: 55, fullPage: false });
      screenshotJpegBase64 = Buffer.from(screenshot).toString("base64");
    }

    if (restriction.kind) {
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

    const parsed = readTargetSongs(visibleText);
    if (parsed.songs.some((song) => !song.found)) {
      notes.push("至少一首目标歌曲未在鲜打专区可见文本中解析到完整行。");
    }
    if (parsed.songs.every((song) => song.platforms.lizhi == null && song.platforms.kugou == null && song.platforms.qqMusic == null)) {
      notes.push("公开页未见ai荔枝/酷狗/QQ音乐分项数字，分项保持 null。");
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
      songs: parsed.songs,
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
