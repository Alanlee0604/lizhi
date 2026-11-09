import { getCache } from "@vercel/functions";
import { RATE_LIMIT_WINDOW_MS } from "./targets";

const NAMESPACE = "lizhi-readonly-verify";
const LAST_KEY = "probe-last-ms";

const memory = globalThis as typeof globalThis & {
  __lizhiLastProbeMs?: number;
  __lizhiProbeInFlight?: boolean;
};

export function retryAfterSeconds(lastMs: number, nowMs: number, windowMs = RATE_LIMIT_WINDOW_MS): number {
  const elapsed = nowMs - lastMs;
  if (elapsed >= windowMs) return 0;
  return Math.ceil((windowMs - elapsed) / 1000);
}

async function readLastMs(): Promise<number> {
  try {
    const cache = getCache({ namespace: NAMESPACE });
    const cached = await cache.get(LAST_KEY);
    if (typeof cached === "number") return cached;
    if (typeof cached === "string") {
      const parsed = Number(cached);
      if (Number.isFinite(parsed)) return parsed;
    }
  } catch {
    // Local/dev without Runtime Cache falls back to process memory.
  }
  return memory.__lizhiLastProbeMs ?? 0;
}

async function writeLastMs(value: number): Promise<void> {
  memory.__lizhiLastProbeMs = value;
  try {
    const cache = getCache({ namespace: NAMESPACE });
    await cache.set(LAST_KEY, value, {
      ttl: 60 * 10,
      tags: ["lizhi-readonly-verify-probe"],
      name: "probe-last-ms",
    });
  } catch {
    // Ignore cache write failures; memory still limits this instance.
  }
}

export async function consumeRateLimit(nowMs = Date.now()): Promise<{
  allowed: boolean;
  retryAfterSeconds: number;
  limit: string;
}> {
  const last = await readLastMs();
  const wait = retryAfterSeconds(last, nowMs);
  if (wait > 0) {
    return { allowed: false, retryAfterSeconds: wait, limit: "1/min" };
  }
  if (memory.__lizhiProbeInFlight) {
    return { allowed: false, retryAfterSeconds: 30, limit: "1/min" };
  }
  memory.__lizhiProbeInFlight = true;
  await writeLastMs(nowMs);
  return { allowed: true, retryAfterSeconds: 0, limit: "1/min" };
}

export function releaseProbeLock(): void {
  memory.__lizhiProbeInFlight = false;
}

export function rateLimited(retryAfter: number, limit: string): Response {
  return Response.json(
    {
      ok: false,
      error: "rate_limited",
      limit,
      retryAfterSeconds: retryAfter,
      hint: "Cloudflare timer should POST about every 5 minutes. Abuse cap is 1 call per minute.",
    },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    },
  );
}
