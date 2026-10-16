import { useMemo } from 'react';
import { buildGenericLayout, proposeTemplates, type ObservedInventory, type TemplateDocument, type TypeDictionaryFile } from '@eqv/core';
import { TopView } from '@eqv/renderer';
import { formatProposalEvidence } from './evidence.js';

export interface TemplateProposalsProps {
  inventory: ObservedInventory;
  dictionaries: readonly TypeDictionaryFile[];
  templates: readonly TemplateDocument[];
}

const THUMB = { width: 160, height: 120 };

export function TemplateProposals({ inventory, dictionaries, templates }: TemplateProposalsProps) {
  const result = useMemo(() => {
    if (inventory.aliases.length === 0) return null;
    const proposals = proposeTemplates({ inventory, dictionaries: [...dictionaries], templates: [...templates] });
    const generic = proposals.some(({ fits }) => fits) ? null : buildGenericLayout({ inventory, dictionaries: [...dictionaries] }).layout;
    return { proposals, generic };
  }, [inventory, dictionaries, templates]);
  return (
    <section aria-labelledby="eqv-ed-proposals-heading" className="eqv-ed-section">
      <h2 id="eqv-ed-proposals-heading">③ Template 제안</h2>
      {result === null ? <p>관측된 alias가 없어 Template을 제안할 수 없습니다.</p> : (
        <ol className="eqv-ed-cards">
          {result.proposals.map((proposal) => {
            const template = templates.find(({ id }) => id === proposal.templateId)!;
            return (
              <li key={proposal.templateId} className="eqv-ed-card">
                <h3>{proposal.rank}. {template.name} <code>{template.id}</code></h3>
                <p className={`eqv-ed-fit eqv-ed-fit-${proposal.fits ? 'yes' : 'no'}`}>{proposal.fits ? '✓ 적합' : '✗ 부적합'}</p>
                <div role="img" aria-label={`${template.name} 미리보기`} className="eqv-ed-thumb">
                  <TopView layout={template} labels="none" {...THUMB} />
                </div>
                <p>{formatProposalEvidence(proposal)}</p>
                <p>설명 안 되는 alias: {proposal.unexplainedAliases.length ? proposal.unexplainedAliases.join(', ') : '없음'}</p>
              </li>
            );
          })}
          {result.generic && (
            <li className="eqv-ed-card">
              <h3>Generic Layout</h3>
              <p>맞는 템플릿 없음</p>
              <div role="img" aria-label="Generic Layout 미리보기" className="eqv-ed-thumb">
                <TopView layout={result.generic} labels="none" {...THUMB} />
              </div>
              <p>모든 형상·배정은 assumed입니다</p>
            </li>
          )}
        </ol>
      )}
    </section>
  );
}
