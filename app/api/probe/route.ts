import { consumeProbeSlot, isAuthorized, unauthorized } from "@/lib/limits";
import { scrapeVisibleChart } from "@/lib/scrape";
import { MAX_MANUAL_PROBES, PROBE_TIMEOUT_MS } from "@/lib/targets";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      ok: false,
      error: "method_not_allowed",
      hint: "Manual read-only probe is POST /api/probe with Authorization: Bearer <PROBE_TOKEN>. Max 2 calls.",
    },
    { status: 405 },
  );
}

export async function POST(request: Request) {
  if (!process.env.PROBE_TOKEN) {
    return Response.json(
      { ok: false, error: "server_misconfigured", hint: "PROBE_TOKEN is not set on this deployment." },
      { status: 500 },
    );
  }
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  const slot = await consumeProbeSlot();
  if (!slot.allowed) {
    return Response.json(
      {
        ok: false,
        error: "probe_limit_reached",
        max: MAX_MANUAL_PROBES,
        remaining: 0,
        hint: "This isolated project allows at most 2 manual read-only probes.",
      },
      { status: 429 },
    );
  }

  try {
    const result = await Promise.race([
      scrapeVisibleChart(slot.remaining),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`probe exceeded ${PROBE_TIMEOUT_MS}ms`)), PROBE_TIMEOUT_MS);
      }),
    ]);
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
        probeRemaining: slot.remaining,
      },
      { status: 504 },
    );
  }
}
