import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { layoutRevision, type BindingsFile, type MappingConflict, type MappingVersion } from '@eqv/core';
import { DataTable, DetailFields, LoadingBlock, Panel, StateMessage } from '@eqv/ui';
import { Button, Callout, EmptyState, Input, Label, PanelSectionTitle } from '@fops/ui';
import { Play, Send, TriangleAlert } from 'lucide-react';
import type { TopViewerProps } from '@eqv/renderer';
import { describeConflict } from './conflict-text.js';
import {
  conflictHighlight, defaultEffectiveFrom, derivePublishPlan, dryRun, latestBinding, shortHash,
  type DryRun, type DryRunInput, type ModelDryRunRow, type PublishPlan,
} from './publish.js';

export const DIRTY_REASON = '저장하지 않은 변경이 있습니다. 저장한 뒤 게시할 수 있습니다';

export interface PublishPanelProps {
  input: DryRunInput;
  /** The equipment's bindings file; null before the first publish. */
  bindings: BindingsFile | null;
  /** The Mapping Version of the latest binding, when it could be loaded. */
  previous: MappingVersion | null;
  /** The Board has unsaved edits; Publish waits for the save. */
  boardDirty: boolean;
  /** The host owns the publication lifetime, so a reload does not lose it. */
  publishing: boolean;
  receipt: { mappingHash: string; effectiveFrom: string } | null;
  onPublish(plan: PublishPlan): Promise<{ ok: true; mappingHash: string } | { ok: false; error: string }>;
  onHighlight(highlight: NonNullable<TopViewerProps['highlight']> | null): void;
  /** Hosts may report listed equipment whose maker/model could not be read. */
  onModelDryRun(): Promise<ModelDryRunRow[] | { rows: ModelDryRunRow[]; unreadable: number }>;
  renderLink(equipmentId: string): ReactNode;
}

const percent = (ratio: number | null) => ratio === null ? '—' : `${Math.round(ratio * 100)}%`;
const count = (n: number | null) => n === null ? '—' : String(n);
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);
const conflictKey = (conflict: MappingConflict) => JSON.stringify(conflict);

/** The result is kept with the inputs it was computed for, so a late result for older inputs is never shown. */
type Computed<T> = { inputs: readonly unknown[]; value: T } | { inputs: readonly unknown[]; error: string };
function useComputed<T>(inputs: readonly unknown[], compute: () => Promise<T>): Computed<T> | null {
  const [result, setResult] = useState<Computed<T> | null>(null);
  useEffect(() => {
    let current = true;
    compute().then(
      (value) => { if (current) setResult({ inputs, value }); },
      (error: unknown) => { if (current) setResult({ inputs, error: messageOf(error) }); },
    );
    return () => { current = false; };
    // The caller passes every value `compute` reads.
  }, inputs);
  const fresh = result && result.inputs.length === inputs.length && result.inputs.every((value, i) => Object.is(value, inputs[i]));
  return fresh ? result : null;
}

export function PublishPanel(props: PublishPanelProps) {
  const { input, bindings, previous, boardDirty, publishing, receipt, onPublish, onHighlight, onModelDryRun, renderLink } = props;
  const ids = useId();
  const prefill = defaultEffectiveFrom(input.inventory, bindings);
  const [from, setFrom] = useState({ prefill, value: receipt?.effectiveFrom ?? prefill, touched: false });
  const [active, setActive] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [model, setModel] = useState<{ equipmentId: string; rows: ModelDryRunRow[] | null; unreadable: number; error: string | null; loading: boolean } | null>(null);
  const alive = useRef(true);
  const busy = useRef(false);
  const modelRequest = useRef(0);
  const activeRef = useRef<string | null>(null);
  const highlightRef = useRef(onHighlight);
  useEffect(() => {
    highlightRef.current = onHighlight;
    activeRef.current = active;
  }, [onHighlight, active]);
  if (from.prefill !== prefill) setFrom({ prefill, value: prefill, touched: false });
  const [seenReceipt, setSeenReceipt] = useState(receipt);
  if (seenReceipt !== receipt) {
    setSeenReceipt(receipt);
    setFailure(null);
  }
  const effectiveFrom = from.prefill === prefill ? from.value : prefill;
  const { equipment, inventory, dictionaries, layout, ruleFiles } = input;
  const inputs = [equipment, inventory, dictionaries, layout, ruleFiles] as const;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (activeRef.current !== null) highlightRef.current(null);
    };
  }, []);

  const computed = useComputed(inputs, async () => {
    const [run, revision] = await Promise.all([dryRun(input), layoutRevision(layout)]);
    return { run, revision };
  });
  const prepared = computed && 'value' in computed ? computed.value : null;
  const run: DryRun | null = prepared?.run ?? null;
  const plan = prepared ? derivePublishPlan({ ...input, bindings, previous, effectiveFrom }, prepared) : null;
  const computeError = computed && 'error' in computed ? computed.error : null;

  const conflicts = run?.conflicts ?? [];
  const activeConflict = active === null ? null : conflicts.find((conflict) => conflictKey(conflict) === active) ?? null;
  useEffect(() => {
    if (active !== null && run && !activeConflict) {
      setActive(null);
      highlightRef.current(null);
    }
  }, [active, run, activeConflict]);

  const toggle = (conflict: MappingConflict) => {
    const key = conflictKey(conflict);
    const next = active === key ? null : key;
    setActive(next);
    onHighlight(next === null ? null : conflictHighlight(conflict));
  };

  const completed = receipt !== null && effectiveFrom === receipt.effectiveFrom && plan?.mapping?.hash === receipt.mappingHash
    && plan.problems.includes('이전 게시와 같습니다')
    && plan.problems.every((problem) => problem === '이전 게시와 같습니다' || problem.startsWith('effectiveFrom'));
  const awaitingFrom = prefill === '' && !from.touched && effectiveFrom === '';
  const fromHint = awaitingFrom ? `마지막 binding(${latestBinding(bindings)?.effectiveFrom})보다 늦은 시각을 입력하세요` : null;
  const effectiveError = completed || awaitingFrom ? null : plan?.problems.find((problem) => problem.startsWith('effectiveFrom')) ?? null;
  const reason = boardDirty ? DIRTY_REASON : !plan ? (computeError ?? '계산 중…')
    : completed ? '이전 게시와 같습니다' : plan.problems.map((problem) => awaitingFrom && problem.startsWith('effectiveFrom') ? fromHint : problem).join(' · ') || null;
  const blocked = reason !== null || publishing;
  const hintId = `${ids}-from-hint`;
  const errorId = `${ids}-from-error`;
  const reasonId = `${ids}-reason`;

  const publish = async () => {
    if (blocked || !plan || busy.current) return;
    busy.current = true;
    setFailure(null);
    try {
      const outcome = await onPublish(plan);
      if (alive.current && !outcome.ok) setFailure(outcome.error);
    } catch (error) {
      if (alive.current) setFailure(messageOf(error));
    } finally {
      busy.current = false;
    }
  };

  const loadModel = async () => {
    const request = ++modelRequest.current;
    const equipmentId = equipment.equipmentId;
    setModel({ equipmentId, rows: null, unreadable: 0, error: null, loading: true });
    try {
      const result = await onModelDryRun();
      const { rows, unreadable } = Array.isArray(result) ? { rows: result, unreadable: 0 } : result;
      if (alive.current && request === modelRequest.current) setModel({ equipmentId, rows, unreadable, error: null, loading: false });
    } catch (error) {
      if (alive.current && request === modelRequest.current) setModel({ equipmentId, rows: null, unreadable: 0, error: messageOf(error), loading: false });
    }
  };
  const modelState = model && model.equipmentId === equipment.equipmentId ? model : null;

  const status = publishing ? '게시 중…' : failure ?? (receipt ? `게시됨 · ${shortHash(receipt.mappingHash)} · ${receipt.effectiveFrom}` : '');
  const coverage = run?.coverage;
  const diffCaption = `Mapping Version 변경 ${plan?.diff.entries.length ?? 0}건`;
  const modelCaption = modelState?.rows
    ? `${equipment.maker}/${equipment.model} 설비 ${modelState.rows.length}대${modelState.unreadable > 0 ? ` · 읽지 못한 설비 ${modelState.unreadable}대` : ''}` : '';

  return (
    <div className="grid gap-4">
      <Panel title="⑤ 검증 (dry-run)" subtitle="저장된 규칙 파일과 현재 레이아웃 초안 기준입니다. 저장하지 않은 자동 초안은 미매핑으로 계산됩니다.">
        <div className="grid gap-4">
          {computeError && <StateMessage compact tone="danger" icon={TriangleAlert} title="검증을 계산하지 못했습니다" body={computeError} />}
          {!run && !computeError && <LoadingBlock label="계산 중…" rows={2} />}
          {run && run.issues.length > 0 && (
            <Callout tone="red" title="Publish를 막는 규칙 문제" icon={<TriangleAlert className="size-3.5" aria-hidden />}>
              <ul className="m-0 list-disc pl-5" aria-label="Publish를 막는 규칙 문제">
                {run.issues.map((issue) => <li key={JSON.stringify([issue.code, issue.path])}>{issue.code}: {issue.message}</li>)}
              </ul>
            </Callout>
          )}
          {coverage && (
            <>
              <DetailFields items={[{ key: 'coverage', label: '커버리지', value:
                `참조 ${coverage.references.resolved}/${coverage.references.total} (${percent(coverage.references.ratio)}) · `
                + `alias ${coverage.aliases.resolved}/${coverage.aliases.total} (${percent(coverage.aliases.ratio)}) · `
                + `assumed ${percent(coverage.assumed.ratio)} · 무시 ${coverage.ignored.aliases.length}` }]} />
              <div>
                <PanelSectionTitle className="mb-2">미매핑 alias</PanelSectionTitle>
                {coverage.unmapped.length === 0 ? <EmptyState size="sm" title="미매핑 alias가 없습니다." /> : (
                  <DataTable label="미매핑 alias" columns={['alias', { id: 'impact', header: '영향도', align: 'end' }]}>
                    {coverage.unmapped.map(({ alias, references }) => (
                      <DataTable.Row key={alias}>
                        <DataTable.Cell rowHeader>{alias}</DataTable.Cell>
                        <DataTable.Cell numeric>{references}</DataTable.Cell>
                      </DataTable.Row>
                    ))}
                  </DataTable>
                )}
              </div>
            </>
          )}
          {run?.mapping && (
            <div>
              <PanelSectionTitle className="mb-2">Mapping Conflict</PanelSectionTitle>
              {conflicts.length === 0 ? <EmptyState size="sm" title="Mapping Conflict가 없습니다." /> : (
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Mapping Conflict">
                  {conflicts.map((conflict) => (
                    <li key={conflictKey(conflict)}>
                      <Button type="button" variant={conflictKey(conflict) === active ? 'secondary' : 'outline'} size="toolbar"
                        aria-pressed={conflictKey(conflict) === active} onClick={() => toggle(conflict)}>
                        {describeConflict(conflict)}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </Panel>

      <Panel title="⑥ Publish">
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Label>
              effectiveFrom{' '}
              <Input
                type="text" className="min-w-68" value={effectiveFrom} spellCheck={false} aria-invalid={effectiveError !== null}
                aria-describedby={effectiveError ? errorId : fromHint ? hintId : undefined}
                onChange={(event) => setFrom({ prefill, value: event.target.value, touched: true })}
              />
            </Label>
            {fromHint && <span id={hintId} className="text-text-secondary">{fromHint}</span>}
            {effectiveError && <span id={errorId} className="font-semibold text-text-danger">{effectiveError}</span>}
          </div>
          {plan && (
            <>
              <DetailFields items={[
                { key: 'layout', label: 'Layout', value: plan.diff.layout },
                { key: 'baseline', label: 'Baseline', value: `Baseline Inventory: ${plan.baseline.from} – ${plan.baseline.to}` },
                ...(plan.diff.binding.length > 0 ? [{ key: 'binding', label: 'Binding 변경', value: (
                  <ul aria-label="Binding 변경" className="m-0 list-none p-0">{plan.diff.binding.map((line) => <li key={line}>{line}</li>)}</ul>
                ) }] : []),
                { key: 'unchanged', label: '요약', value: `변경 없음 ${plan.diff.unchanged}건 · Mapping Conflict ${plan.diff.conflicts}건 (게시를 막지 않습니다)` },
              ]} />
              {plan.diff.entries.length > 0 && (
                <DataTable label={diffCaption} title={diffCaption} headingLevel={3} columns={['alias', '변경', '이전', '이후']}>
                  {plan.diff.entries.map((entry) => (
                    <DataTable.Row key={entry.alias}>
                      <DataTable.Cell rowHeader>{entry.alias}</DataTable.Cell>
                      <DataTable.Cell>{{ added: '추가', removed: '삭제', changed: '변경' }[entry.change]}</DataTable.Cell>
                      <DataTable.Cell>{entry.before ?? '—'}</DataTable.Cell>
                      <DataTable.Cell>{entry.after ?? '—'}</DataTable.Cell>
                    </DataTable.Row>
                  ))}
                </DataTable>
              )}
            </>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="primary" size="sm" aria-disabled={blocked} aria-describedby={reason ? reasonId : undefined} onClick={publish}>
              <Send className="size-3.5" aria-hidden />게시
            </Button>
            {reason && <span id={reasonId} className="text-text-secondary">{reason}</span>}
          </div>
          <p role="status" className="m-0 min-h-6 font-semibold">{status}</p>
        </div>
      </Panel>

      <Panel title="같은 Model 일괄 dry-run"
        actions={(
          <Button type="button" variant="secondary" size="toolbar" disabled={modelState?.loading} loading={modelState?.loading} onClick={loadModel}>
            <Play className="size-3.5" aria-hidden />같은 Model 일괄 dry-run 실행
          </Button>
        )}>
        {modelState?.loading && <LoadingBlock label="계산 중…" rows={2} />}
        {modelState?.error && <StateMessage compact tone="danger" icon={TriangleAlert} title="일괄 dry-run을 계산하지 못했습니다" body={modelState.error} />}
        {modelState?.rows && (
          <DataTable
            label={modelCaption}
            title={modelCaption}
            headingLevel={3}
            columns={['equipmentId', '상태', { id: 'reference', header: '참조 coverage', align: 'end' }, { id: 'alias', header: 'alias coverage', align: 'end' },
              { id: 'conflicts', header: '충돌', align: 'end' }, { id: 'unmapped', header: '미매핑 참조', align: 'end' }, { id: 'blocking', header: '막는 문제', align: 'end' }, '오류']}
          >
            {modelState.rows.map((row) => (
              <DataTable.Row key={row.equipmentId}>
                <DataTable.Cell rowHeader>{renderLink(row.equipmentId)}</DataTable.Cell>
                <DataTable.Cell>{row.status}</DataTable.Cell>
                <DataTable.Cell numeric>{percent(row.referenceRatio)}</DataTable.Cell>
                <DataTable.Cell numeric>{percent(row.aliasRatio)}</DataTable.Cell>
                <DataTable.Cell numeric>{count(row.conflicts)}</DataTable.Cell>
                <DataTable.Cell numeric>{count(row.unmappedReferences)}</DataTable.Cell>
                <DataTable.Cell numeric>{count(row.blockingIssues)}</DataTable.Cell>
                <DataTable.Cell>{row.error ?? '—'}</DataTable.Cell>
              </DataTable.Row>
            ))}
          </DataTable>
        )}
      </Panel>
    </div>
  );
}
