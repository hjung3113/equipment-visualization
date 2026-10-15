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
