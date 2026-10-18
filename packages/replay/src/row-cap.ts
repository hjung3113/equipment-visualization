/** Until list virtualization lands (#113), a list renders at most this many rows. */
export const ROW_CAP = 500;

export interface RowSlice { start: number; end: number; capped: boolean }

/** The contiguous `[start, end)` slice of at most `max` rows that contains `center`, as centred on it as the list edges allow. */
export function rowSlice(total: number, center: number, max: number = ROW_CAP): RowSlice {
  if (total <= max) return { start: 0, end: total, capped: false };
  const at = Math.min(Math.max(center, 0), total - 1);
  const start = Math.min(Math.max(at - Math.floor(max / 2), 0), total - max);
  return { start, end: start + max, capped: true };
}

/** 1-based range in the notice shown above a capped list. */
export const capNotice = (what: string, total: number, slice: RowSlice) =>
  `${what} ${total.toLocaleString('en-US')}개 중 ${(slice.start + 1).toLocaleString('en-US')}–${slice.end.toLocaleString('en-US')}번째 ${(slice.end - slice.start).toLocaleString('en-US')}개만 표시합니다. 범위를 좁히면 모두 볼 수 있습니다.`;
