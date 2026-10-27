import { z } from 'zod';

// Site Wall-clock (GLOSSARY.md): naive "YYYY-MM-DDTHH:mm:ss.fff", no timezone; compare as strings, never through a JS time API.
export const siteWallClockSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/);
export type SiteWallClock = z.infer<typeof siteWallClockSchema>;

// Why a string is not a Site Wall-clock (ADR-0009). Diagnosis only: it never fixes, truncates or pads the value, and
// it is exactly the regex above (calendar validity is not judged here).
export type WallClockDiagnosis =
  | { ok: true }
  | { ok: false; reason: 'fraction-too-long' | 'fraction-missing' | 'offset' | 'malformed' };
export function diagnoseWallClock(value: string): WallClockDiagnosis {
  if (siteWallClockSchema.safeParse(value).success) return { ok: true };
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return { ok: false, reason: 'offset' };
  if (/T\d{2}:\d{2}:\d{2}\.\d{4,}$/.test(value)) return { ok: false, reason: 'fraction-too-long' };
  if (/T\d{2}:\d{2}:\d{2}$/.test(value)) return { ok: false, reason: 'fraction-missing' };
  return { ok: false, reason: 'malformed' };
}

// Arithmetic on timezone-free integers: milliseconds since 0001-01-01T00:00:00.000, proleptic Gregorian.
const DAY = 86_400_000;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const isLeap = (year: number) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
const monthDays = (year: number, month: number) => month === 2 && isLeap(year) ? 29 : MONTH_DAYS[month - 1]!;
const daysBeforeYear = (year: number) => {
  const y = year - 1;
  return 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400);
};
const LAST_MILLIS = (daysBeforeYear(10_000)) * DAY - 1;

export function wallClockToMillis(t: SiteWallClock): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/.exec(t);
  if (!match) throw new RangeError(`Not a Site Wall-clock: ${t}`);
  const [year, month, day, hour, minute, second, milli] = match.slice(1).map(Number) as [number, number, number, number, number, number, number];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > monthDays(year, month) || hour > 23 || minute > 59 || second > 59) {
    throw new RangeError(`Impossible Site Wall-clock: ${t}`);
  }
  let days = daysBeforeYear(year) + day - 1;
  for (let m = 1; m < month; m++) days += monthDays(year, m);
  return days * DAY + ((hour * 60 + minute) * 60 + second) * 1000 + milli;
}

export function millisToWallClock(ms: number): SiteWallClock {
  if (!Number.isInteger(ms) || ms < 0 || ms > LAST_MILLIS) {
    throw new RangeError(`Not a representable Site Wall-clock instant: ${ms}`);
  }
  let days = Math.floor(ms / DAY);
  const rest = ms - days * DAY;
  let year = Math.floor(days / 365.2425) + 1;
  while (daysBeforeYear(year) > days) year--;
  while (daysBeforeYear(year + 1) <= days) year++;
  days -= daysBeforeYear(year);
  let month = 1;
  while (days >= monthDays(year, month)) days -= monthDays(year, month++);
  const pad = (value: number, width: number) => String(value).padStart(width, '0');
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(days + 1, 2)}T${pad(Math.floor(rest / 3_600_000), 2)}:${pad(Math.floor(rest / 60_000) % 60, 2)}:${pad(Math.floor(rest / 1000) % 60, 2)}.${pad(rest % 1000, 3)}`;
}

export type WallClockRange =
  | { ok: true; from: SiteWallClock; to: SiteWallClock }
  | { ok: false; problem: 'format' | 'order' };
/** A `[from, to)` pair from two strings: `format` when either is not a real Site Wall-clock (shape or calendar), `order` unless from < to. Callers word their own message. */
export function parseWallClockRange(from: string, to: string): WallClockRange {
  const a = siteWallClockSchema.safeParse(from);
  const b = siteWallClockSchema.safeParse(to);
  if (!a.success || !b.success) return { ok: false, problem: 'format' };
  try {
    return wallClockToMillis(a.data) < wallClockToMillis(b.data) ? { ok: true, from: a.data, to: b.data } : { ok: false, problem: 'order' };
  } catch {
    return { ok: false, problem: 'format' };
  }
}
