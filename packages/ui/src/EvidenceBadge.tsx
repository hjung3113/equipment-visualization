import type { ReactNode } from 'react';
import { Badge } from '@ap/ui';
import type { EvidenceLevel } from '@eqv/core';

export interface EvidenceBadgeProps {
  level: EvidenceLevel;
  /** The consumer's label; @eqv/ui owns no words. */
  children: ReactNode;
}

// Not colour alone (ADR-0003): each level has its own border style, and `illustrative` is also italic so it never
// reads as `observed`. The border sits on a span this package owns; the Badge inside is the borderless `secondary` variant so the
// level's frame is the only border (the outline variant added a second one).
const FRAME: Record<EvidenceLevel, string> = {
  observed: 'border-2 border-solid',
  derived: 'border-2 border-dashed',
  illustrative: 'border-2 border-dotted italic',
  unknown: 'border-4 border-double',
};

export function EvidenceBadge({ level, children }: EvidenceBadgeProps) {
  return (
    <span className={`inline-flex rounded-md border-border-subtle ${FRAME[level]}`}>
      <Badge variant="secondary" data-evidence={level}>{children}</Badge>
    </span>
  );
}
