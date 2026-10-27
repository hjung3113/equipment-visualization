import { HASH_PATTERN } from './mapping/schema.js';

/** Extract the 64 lowercase hex digits from a SHA-256 hash. */
export function hashHex(hash: string): string {
  if (!HASH_PATTERN.test(hash)) throw new RangeError('hash must be sha256:<64 lowercase hex>');
  return hash.slice('sha256:'.length);
}
