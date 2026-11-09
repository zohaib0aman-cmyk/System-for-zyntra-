import { APP_TIMEZONE } from "./constants";

/** Offset (ms) of `tz` from UTC at the given instant, e.g. +19800000 for Asia/Kolkata. */
function tzOffsetMs(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Wall-clock date/time in `tz` → UTC instant. */
export function zonedTimeToUtc(y: number, m: number, d: number, h = 0, min = 0, tz = APP_TIMEZONE): Date {
  const guess = Date.UTC(y, m - 1, d, h, min);
  return new Date(guess - tzOffsetMs(new Date(guess), tz));
}

/** "YYYY-MM-DD" of `date` in `tz`. */
export function dateKey(date: Date = new Date(), tz = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Start of the given "YYYY-MM-DD" day in `tz`, as a UTC Date. */
export function startOfDay(key: string, tz = APP_TIMEZONE): Date {
  const [y, m, d] = key.split("-").map(Number);
  return zonedTimeToUtc(y, m, d, 0, 0, tz);
}

/** End of today (= start of tomorrow) in `tz`. Follow-ups due before this are "today or overdue". */
export function endOfToday(now: Date = new Date(), tz = APP_TIMEZONE): Date {
  const [y, m, d] = dateKey(now, tz).split("-").map(Number);
  return zonedTimeToUtc(y, m, d + 1, 0, 0, tz);
}

export function startOfToday(now: Date = new Date(), tz = APP_TIMEZONE): Date {
  return startOfDay(dateKey(now, tz), tz);
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "in 3 hours", "2 days ago", "yesterday" … */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const diff = new Date(iso).getTime() - now.getTime();
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000_000],
    ["month", 2_592_000_000],
    ["week", 604_800_000],
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];
  for (const [unit, ms] of units) if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  return diff < 0 ? "just now" : "in a moment";
}

export function formatDateTime(iso: string, tz = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(new Date(iso));
}
