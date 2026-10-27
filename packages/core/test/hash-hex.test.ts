import { expect, it } from 'vitest';
import { hashHex } from '../src/index.js';

it('extracts the hex of a valid hash and rejects malformed hashes', () => {
  const hex = '0123456789abcdef'.repeat(4);
  expect(hashHex(`sha256:${hex}`)).toBe(hex);
  for (const bad of [hex, 'sha256:abc', `sha256:${hex.toUpperCase()}`]) {
    expect(() => hashHex(bad)).toThrow(RangeError);
  }
});
