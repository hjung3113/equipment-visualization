export const compareText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
export const isIntegerSlot = (slot: string): boolean => /^[+-]?[0-9]+$/.test(slot);
export function compareSlots(a: string, b: string): number {
  const aInteger = isIntegerSlot(a);
  const bInteger = isIntegerSlot(b);
  if (aInteger && bInteger) {
    const left = BigInt(a);
    const right = BigInt(b);
    if (left !== right) return left < right ? -1 : 1;
  } else if (aInteger !== bInteger) return aInteger ? -1 : 1;
  return compareText(a, b);
}

export function compareNatural(a: string, b: string): number {
  const left = a.match(/[0-9]+|[^0-9]+/g) ?? [];
  const right = b.match(/[0-9]+|[^0-9]+/g) ?? [];
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const x = left[i]!;
    const y = right[i]!;
    if (/^[0-9]+$/.test(x) && /^[0-9]+$/.test(y)) {
      if (BigInt(x) !== BigInt(y)) return BigInt(x) < BigInt(y) ? -1 : 1;
    } else {
      const order = compareText(x, y);
      if (order) return order;
    }
  }
  return Math.sign(left.length - right.length) || compareText(a, b);
}
