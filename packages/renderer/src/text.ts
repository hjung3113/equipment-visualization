function isHangulOrCjk(code: number): boolean {
  return (code >= 0x1100 && code <= 0x11ff)
    || (code >= 0x3130 && code <= 0x318f)
    || (code >= 0xac00 && code <= 0xd7af)
    || (code >= 0x3040 && code <= 0x30ff)
    || (code >= 0x3400 && code <= 0x9fff)
    || (code >= 0xf900 && code <= 0xfaff)
    || (code >= 0xff00 && code <= 0xffef);
}

/**
 * Width estimate in px. There is no DOM measurement.
 * Hangul/CJK 1.0, other uppercase and digits 0.62, lowercase 0.55, space 0.3.
 * Punctuation and any other character use the lowercase width. Mono is 0.6 for every character.
 */
export function estimateTextWidth(text: string, px: number, mono: boolean): number {
  if (mono) return [...text].length * 0.6 * px;
  let width = 0;
  for (const ch of text) {
    if (ch === ' ') {
      width += 0.3 * px;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if (isHangulOrCjk(code)) width += px;
    else if (/[A-Z0-9]/.test(ch)) width += 0.62 * px;
    else width += 0.55 * px;
  }
  return width;
}
