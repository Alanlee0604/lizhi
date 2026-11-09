import { timingSafeEqual } from "node:crypto";

function secretEquals(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
}

export function unauthorized(): Response {
  return Response.json(
    {
      ok: false,
      error: "unauthorized",
      hint: "Send Authorization: Bearer <PROBE_TOKEN>. Optional: Bearer <CRON_SECRET> if that env is set.",
    },
    { status: 401 },
  );
}

export function isAuthorized(request: Request): boolean {
  const probe = process.env.PROBE_TOKEN || "";
  const cron = process.env.CRON_SECRET || "";
  const bearer = bearerToken(request);
  const probeHeader = request.headers.get("x-probe-token")?.trim() || "";
  const cronHeader = request.headers.get("x-cron-secret")?.trim() || "";

  return (
    secretEquals(bearer, probe) ||
    secretEquals(probeHeader, probe) ||
    secretEquals(bearer, cron) ||
    secretEquals(cronHeader, cron)
  );
}
