/**
 * Independent Cloudflare Worker: POST the already-deployed Vercel probe.
 * Does not use Cloudflare Browser Rendering. Does not ingest. Does not
 * enable cron by itself — parent bot sets secrets + STOP_AT and attaches
 * a 2-minute schedule after review. This file must not enable cron.
 */

const PROBE_TIMEOUT_MS = 110_000;

let inflight = false;

function parseStopAt(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = Date.parse(value.trim());
  return Number.isFinite(ms) ? ms : null;
}

function shouldStop(stopAtMs, nowMs = Date.now()) {
  return stopAtMs != null && nowMs >= stopAtMs;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function missingEnv(env) {
  const required = ["PROBE_URL", "PROBE_TOKEN", "VERCEL_AUTOMATION_BYPASS_SECRET", "STOP_AT"];
  return required.filter((key) => !env[key] || !String(env[key]).trim());
}

export async function tick(env, nowMs = Date.now()) {
  const missing = missingEnv(env);
  if (missing.length) {
    return {
      ok: false,
      skipped: true,
      reason: `missing required env: ${missing.join(", ")}`,
      stopped: false,
    };
  }

  const stopAtMs = parseStopAt(env.STOP_AT);
  if (stopAtMs == null) {
    return {
      ok: false,
      skipped: true,
      reason: "STOP_AT must be a parseable timestamp (include timezone), e.g. 2026-11-09T21:00:00+08:00",
      stopped: false,
    };
  }
  if (shouldStop(stopAtMs, nowMs)) {
    return {
      ok: true,
      skipped: true,
      reason: "STOP_AT reached; probe cron idle",
      stopped: true,
    };
  }
  if (inflight) {
    return {
      ok: false,
      skipped: true,
      reason: "previous probe still in flight",
      stopped: false,
    };
  }

  inflight = true;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const response = await fetch(env.PROBE_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.PROBE_TOKEN}`,
          "x-vercel-protection-bypass": env.VERCEL_AUTOMATION_BYPASS_SECRET,
          "Content-Type": "application/json",
        },
        body: "{}",
        signal: controller.signal,
      });
      const body = (await response.text()).slice(0, 1500);
      return {
        ok: response.ok,
        skipped: false,
        stopped: false,
        status: response.status,
        body,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, skipped: false, stopped: false, reason: message };
  } finally {
    inflight = false;
  }
}

export default {
  async scheduled(_event, env) {
    const result = await tick(env);
    console.log("lizhi-probe-cron", result.ok, result.skipped, result.stopped, result.status || result.reason);
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      const stopAtMs = parseStopAt(env.STOP_AT);
      return json({
        ok: true,
        worker: "lizhi-readonly-verify-probe-cron",
        stopped: shouldStop(stopAtMs),
        stopAtConfigured: Boolean(env.STOP_AT && String(env.STOP_AT).trim()),
        browser: false,
      });
    }
    return json({ ok: false, error: "not_found", hint: "This worker only runs on cron. GET /health for status." }, 404);
  },
};
