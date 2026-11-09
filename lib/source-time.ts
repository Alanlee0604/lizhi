const SHANGHAI_OFFSET = "+08:00";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function shanghaiParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const raw = parts.find((part) => part.type === type)?.value;
    return Number(raw);
  };
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function shiftShanghaiDate(year: number, month: number, day: number, deltaDays: number): {
  year: number;
  month: number;
  day: number;
} {
  const utc = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

/** Combine 更新至HH:MM with the Shanghai calendar day of collectedAt. */
export function combineShanghaiClock(
  sourceUpdateText: string | null | undefined,
  collectedAt: Date,
): string | null {
  if (!sourceUpdateText) return null;
  const match = sourceUpdateText.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? "0");
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  let { year, month, day, hour: collectedHour, minute: collectedMinute } = shanghaiParts(collectedAt);
  const clockMinutes = hour * 60 + minute;
  const collectedMinutes = collectedHour * 60 + collectedMinute;
  if (clockMinutes - collectedMinutes > 5) {
    ({ year, month, day } = shiftShanghaiDate(year, month, day, -1));
  }

  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}${SHANGHAI_OFFSET}`;
}

export function isPositiveInt(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
