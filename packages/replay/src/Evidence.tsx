import { EvidenceBadge } from '@eqv/ui';
import type { EvidenceLevel } from '@eqv/core';
import { LEVEL_KO } from './words.js';

/** A facet's evidence level as an `EvidenceBadge` with its word: shape and text, never colour alone (ADR-0003). */
export function Evidence({ level }: { level: EvidenceLevel }) {
  return <EvidenceBadge level={level}>{LEVEL_KO[level]}</EvidenceBadge>;
}
