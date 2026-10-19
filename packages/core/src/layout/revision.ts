import { canonicalJson, sha256Hex } from '../canonical.js';
import type { LayoutDocument } from './schema.js';

/** Content hash of a Layout (`sha256:<hex>`); the same value as `replayKey(...).layoutHash`. */
export function layoutRevision(layout: LayoutDocument): Promise<string> {
  return sha256Hex(canonicalJson(layout));
}
