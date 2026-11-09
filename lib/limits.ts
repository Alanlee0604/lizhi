import { getCache } from "@vercel/functions";
import { MAX_MANUAL_PROBES } from "./targets";

const NAMESPACE = "lizhi-readonly-verify";
const COUNT_KEY = "manual-probe-count";

const memory = globalThis as typeof globalThis & { __lizhiProbeCount?: number };

async function readCount(): Promise<number> {
  try {
    const cache = getCache({ namespace: NAMESPACE });
    const cached = await cache.get(COUNT_KEY);
    if (typeof cached === "number") return cached;
    if (typeof cached === "string") {
      const parsed = Number(cached);
      if (Number.isFinite(parsed)) return parsed;
    }
  } catch {
    // Local/dev without Runtime Cache falls back to process memory.
  }
  return memory.__lizhiProbeCount ?? 0;
}

async function writeCount(count: number): Promise<void> {
  memory.__lizhiProbeCount = count;
  try {
    const cache = getCache({ namespace: NAMESPACE });
    await cache.set(COUNT_KEY, count, {
      ttl: 60 * 60 * 24 * 7,
      tags: ["lizhi-readonly-verify-probe"],
      name: "manual-probe-count",
    });
  } catch {
    // Ignore cache write failures; memory still limits this instance.
  }
}

export async function consumeProbeSlot(): Promise<{ allowed: boolean; remaining: number; used: number }> {
  const used = await readCount();
  if (used >= MAX_MANUAL_PROBES) {
    return { allowed: false, remaining: 0, used };
  }
  const next = used + 1;
  await writeCount(next);
  return { allowed: true, remaining: MAX_MANUAL_PROBES - next, used: next };
}

export function unauthorized(): Response {
  return Response.json(
    { ok: false, error: "unauthorized", hint: "Send header Authorization: Bearer <PROBE_TOKEN>" },
    { status: 401 },
  );
}

export function isAuthorized(request: Request): boolean {
  const expected = process.env.PROBE_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  const alt = request.headers.get("x-probe-token")?.trim() || "";
  return bearer === expected || alt === expected;
}
