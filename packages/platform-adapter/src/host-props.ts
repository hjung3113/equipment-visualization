import type { ModuleHost } from '@ap/contracts';
import { siteWallClockSchema, wallClockToMillis, type SiteWallClock } from '@eqv/core';

const NAIVE_SECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

/**
 * The host's Global Context carries naive `YYYY-MM-DDTHH:mm:ss`; a Site Wall-clock needs `.fff` (ADR-0009). Padding `.000` happens
 * here, once, at the host boundary (`diagnoseWallClock` only diagnoses). Anything else that is not a Site Wall-clock is null.
 */
export function hostWallClock(value: string): SiteWallClock | null {
  const parsed = siteWallClockSchema.safeParse(NAIVE_SECONDS.test(value) ? `${value}.000` : value);
  return parsed.success ? parsed.data : null;
}

export type HostTime =
  | { kind: 'unsupported' }
  | { kind: 'missing' }
  | { kind: 'invalid'; problem: string }
  | { kind: 'applied'; from: SiteWallClock; to: SiteWallClock };

export type HostProps = {
  equipment: string | null;
  entityType: string | null;
  anchor: string | null;
  /** The applied Focus 재생 구간 (page keys `rangeFrom`/`rangeTo`); null unless both are a real, ordered Site Wall-clock pair. */
  range: { from: SiteWallClock; to: SiteWallClock } | null;
  time: HostTime;
};

function readRange(host: ModuleHost): HostProps['range'] {
  const from = host.page('rangeFrom');
  const to = host.page('rangeTo');
  const a = from === null ? null : hostWallClock(from);
  const b = to === null ? null : hostWallClock(to);
  if (a === null || b === null) return null;
  const ma = millis(a);
  const mb = millis(b);
  return ma !== null && mb !== null && ma < mb ? { from: a, to: b } : null;
}

/** The schema checks the shape only; an impossible calendar date (02-30) throws in `wallClockToMillis` and is null here. */
function millis(value: SiteWallClock): number | null {
  try {
    return wallClockToMillis(value);
  } catch {
    return null;
  }
}

/** Equipment, entry keys, applied Focus range and applied time of a screen, read from the host. No default is ever filled in. */
export function readHostProps(host: ModuleHost): HostProps {
  const { values, unsupported } = host.context();
  const base = { equipment: host.page('equipment'), entityType: host.page('entityType'), anchor: host.page('anchor'), range: readRange(host) };
  if (unsupported.includes('time')) return { ...base, time: { kind: 'unsupported' } };
  if (!values.from || !values.to) return { ...base, time: { kind: 'missing' } };
  const from = hostWallClock(values.from);
  const to = hostWallClock(values.to);
  const fromMs = from === null ? null : millis(from);
  const toMs = to === null ? null : millis(to);
  if (from === null || to === null || fromMs === null || toMs === null) return { ...base, time: { kind: 'invalid', problem: `Site Wall-clock 형식이 아닙니다 (${values.from} – ${values.to})` } };
  if (!(fromMs < toMs)) return { ...base, time: { kind: 'invalid', problem: '시작은 끝보다 앞서야 합니다' } };
  return { ...base, time: { kind: 'applied', from, to } };
}
