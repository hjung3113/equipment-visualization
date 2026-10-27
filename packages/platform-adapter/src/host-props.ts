import type { ModuleHost } from '@ap/contracts';
import { parseWallClockRange, siteWallClockSchema, type SiteWallClock, type WallClockRange } from '@eqv/core';

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

/** The host pads naive seconds (`hostWallClock`), then the pair is parsed as any other range; a null side is a format problem. */
function hostRange(from: string, to: string): WallClockRange {
  const a = hostWallClock(from);
  const b = hostWallClock(to);
  return a === null || b === null ? { ok: false, problem: 'format' } : parseWallClockRange(a, b);
}

function readRange(host: ModuleHost): HostProps['range'] {
  const from = host.page('rangeFrom');
  const to = host.page('rangeTo');
  if (from === null || to === null) return null;
  const range = hostRange(from, to);
  return range.ok ? { from: range.from, to: range.to } : null;
}

/** Equipment, entry keys, applied Focus range and applied time of a screen, read from the host. No default is ever filled in. */
export function readHostProps(host: ModuleHost): HostProps {
  const { values, unsupported } = host.context();
  const base = { equipment: host.page('equipment'), entityType: host.page('entityType'), anchor: host.page('anchor'), range: readRange(host) };
  if (unsupported.includes('time')) return { ...base, time: { kind: 'unsupported' } };
  if (!values.from || !values.to) return { ...base, time: { kind: 'missing' } };
  const range = hostRange(values.from, values.to);
  if (!range.ok) {
    return { ...base, time: { kind: 'invalid', problem: range.problem === 'format' ? `Site Wall-clock 형식이 아닙니다 (${values.from} – ${values.to})` : '시작은 끝보다 앞서야 합니다' } };
  }
  return { ...base, time: { kind: 'applied', from: range.from, to: range.to } };
}
