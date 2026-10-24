import { useMemo, type ReactNode } from 'react';
import { buildGenericLayout, proposeTemplates, type ObservedInventory, type TemplateDocument, type TypeDictionaryFile } from '@eqv/core';
import { Callout, Card, EmptyState } from '@ap/ui';
import { Panel, StatusBadge } from '@eqv/ui';
import { Check, TriangleAlert, X } from 'lucide-react';
import { TopView } from '@eqv/renderer';
import { formatProposalEvidence } from './evidence.js';

export interface TemplateProposalsProps {
  inventory: ObservedInventory;
  dictionaries: readonly TypeDictionaryFile[];
  templates: readonly TemplateDocument[];
  /** Rendered inside each card; the host decides what choosing a template or the Generic Layout does. */
  action?: (choice: { kind: 'template'; templateId: string } | { kind: 'generic' }) => ReactNode;
}

const THUMB = { width: 160, height: 120 };

export function TemplateProposals({ inventory, dictionaries, templates, action }: TemplateProposalsProps) {
  const result = useMemo(() => {
    if (inventory.aliases.length === 0) return null;
    const proposals = proposeTemplates({ inventory, dictionaries: [...dictionaries], templates: [...templates] });
    const generic = proposals.some(({ fits }) => fits) ? null : buildGenericLayout({ inventory, dictionaries: [...dictionaries] }).layout;
    return { proposals, generic };
  }, [inventory, dictionaries, templates]);
  return (
    <Panel title="③ Template 제안">
      {result === null ? <EmptyState size="sm" title="관측된 alias가 없어 Template을 제안할 수 없습니다." /> : (
        <ol className="m-0 flex list-none flex-wrap gap-4 p-0">
          {result.proposals.map((proposal) => {
            const template = templates.find(({ id }) => id === proposal.templateId)!;
            return (
              <li key={proposal.templateId} className="max-w-70 flex-1 basis-52">
                <Card padding="compact">
                  <h3 className="mb-2 mt-0 text-base leading-5 font-semibold">{proposal.rank}. {template.name} <code>{template.id}</code></h3>
                  <p className="mb-2">
                    {proposal.fits ? <StatusBadge tone="success" icon={Check}>적합</StatusBadge> : <StatusBadge tone="warning" icon={X}>부적합</StatusBadge>}
                  </p>
                  <div role="img" aria-label={`${template.name} 미리보기`} className="mb-2 h-30 w-40 border border-border-subtle bg-surface-canvas">
                    <TopView layout={template} labels="none" {...THUMB} />
                  </div>
                  <p>{formatProposalEvidence(proposal)}</p>
                  <p>설명 안 되는 alias: {proposal.unexplainedAliases.length ? proposal.unexplainedAliases.join(', ') : '없음'}</p>
                  {action?.({ kind: 'template', templateId: template.id })}
                  {action && !proposal.fits && <Callout tone="red" icon={<TriangleAlert className="size-3.5" aria-hidden />} className="mt-2">부적합 Template입니다</Callout>}
                </Card>
              </li>
            );
          })}
          {result.generic && (
            <li className="max-w-70 flex-1 basis-52">
              <Card padding="compact">
                <h3 className="mb-2 mt-0 text-base leading-5 font-semibold">Generic Layout</h3>
                <p>맞는 템플릿 없음</p>
                <div role="img" aria-label="Generic Layout 미리보기" className="mb-2 h-30 w-40 border border-border-subtle bg-surface-canvas">
                  <TopView layout={result.generic} labels="none" {...THUMB} />
                </div>
                <p>모든 형상·배정은 assumed입니다</p>
                {action?.({ kind: 'generic' })}
              </Card>
            </li>
          )}
        </ol>
      )}
    </Panel>
  );
}
