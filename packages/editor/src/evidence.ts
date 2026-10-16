import type { TemplateProposal } from '@eqv/core';

/** The ONBOARDING §3 evidence sentence, built from the structured fields of a proposal. */
export function formatProposalEvidence({ roleFit, transfers, unexplainedAliases }: TemplateProposal): string {
  const parts = roleFit.map(({ role, observed, drawn, min, max, inRange }) =>
    inRange && observed === drawn ? `${role.toUpperCase()} ${observed}/${drawn} ✓` :
      `${role.toUpperCase()} ${observed} (${min}–${max}) ${inRange ? '✓' : '✗'}`);
  parts.push(transfers.total === 0 ? '이송 없음' :
    `이송 ${transfers.explained}/${transfers.total} ${transfers.explained === transfers.total ? '✓' : '✗'}`,
  `설명 안 되는 alias ${unexplainedAliases.length}`);
  return parts.join(', ');
}
