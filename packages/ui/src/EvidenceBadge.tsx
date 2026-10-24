import type { ReactNode } from 'react';
import { OutlineBadge } from './OutlineBadge.js';
import type { EvidenceLevel } from '@eqv/core';

export interface EvidenceBadgeProps {
  level: EvidenceLevel;
  /** The consumer's label; @eqv/ui owns no words. */
  children: ReactNode;
}

// Not colour alone (ADR-0003): each level has its own border style, and `illustrative` is also italic so it never
// reads as `observed`. The border sits on a span this package owns; the Badge inside gets no restyle class.
const FRAME: Record<EvidenceLevel, string> = {
  observed: 'border-2 border-solid',
  derived: 'border-2 border-dashed',
  illustrative: 'border-2 border-dotted italic',
  unknown: 'border-4 border-double',
};

export function EvidenceBadge({ level, children }: EvidenceBadgeProps) {
  return (
    <span className={`inline-flex rounded-md border-border-subtle ${FRAME[level]}`}>
      <OutlineBadge data-evidence={level}>{children}</OutlineBadge>
    </span>
  );
}
