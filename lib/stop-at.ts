export function parseStopAt(value: string | null | undefined): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = Date.parse(value.trim());
  return Number.isFinite(ms) ? ms : null;
}

export function shouldStop(stopAtMs: number | null, nowMs = Date.now()): boolean {
  return stopAtMs != null && nowMs >= stopAtMs;
}
