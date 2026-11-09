import { isAuthorized, unauthorized } from "@/lib/auth";
import { postIngest } from "@/lib/ingest";
import { consumeRateLimit, rateLimited, releaseProbeLock } from "@/lib/limits";
import { scrapeVisibleChart } from "@/lib/scrape";
import { PROBE_TIMEOUT_MS } from "@/lib/targets";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      ok: false,
      error: "method_not_allowed",
      hint: "POST /api/probe with Authorization: Bearer <PROBE_TOKEN>. Optional CRON_SECRET. Rate limit 1/min for a 2-minute Cloudflare timer.",
    },
    { status: 405 },
  );
}

export async function POST(request: Request) {
  if (!process.env.PROBE_TOKEN && !process.env.CRON_SECRET) {
    return Response.json(
      { ok: false, error: "server_misconfigured", hint: "PROBE_TOKEN is not set on this deployment." },
      { status: 500 },
    );
  }
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  const slot = await consumeRateLimit();
  if (!slot.allowed) {
    return rateLimited(slot.retryAfterSeconds, slot.limit);
  }

  const url = new URL(request.url);
  const includeScreenshot = url.searchParams.get("screenshot") === "1";
  const rateLimit = { limit: slot.limit, retryAfterSeconds: 60 };

  try {
    const result = await Promise.race([
      scrapeVisibleChart({ includeScreenshot, rateLimit }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`probe exceeded ${PROBE_TIMEOUT_MS}ms`)), PROBE_TIMEOUT_MS);
      }),
    ]);
    if (result.ok) {
      result.ingest = await postIngest(result);
      if (result.ingest.skipped) {
        result.notes.push("INGEST_TOKEN 未配置，已跳过入库。");
      } else if (!result.ingest.ok) {
        result.notes.push(`入库失败：${result.ingest.reason}`);
      } else {
        result.notes.push("已 POST 到 votes ingest。");
      }
    }
    return Response.json(result, { status: result.ok ? 200 : 503 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = /exceeded|timeout|Timeout/i.test(message);
    return Response.json(
      {
        ok: false,
        layer: "vercel-function-chromium",
        restriction: {
          stopped: true,
          kind: timedOut ? "timeout" : "other",
          message,
        },
        rateLimit,
        ingest: null,
      },
      { status: 504 },
    );
  } finally {
    releaseProbeLock();
  }
}
