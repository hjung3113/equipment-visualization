import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { layoutRevision, type BindingsFile, type MappingConflict, type MappingVersion } from '@eqv/core';
import { DataTable } from '@eqv/ui';
import { Button, Input, Label } from '@fops/ui';
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
  // DataTable has no caption slot: the sentence is shown above the table and names it.
  const diffCaption = `Mapping Version 변경 ${plan?.diff.entries.length ?? 0}건`;
  const modelCaption = modelState?.rows
    ? `${equipment.maker}/${equipment.model} 설비 ${modelState.rows.length}대${modelState.unreadable > 0 ? ` · 읽지 못한 설비 ${modelState.unreadable}대` : ''}` : '';

  return (
    <div>
      <section aria-labelledby={`${ids}-dry`}>
        <h2 id={`${ids}-dry`}>⑤ 검증 (dry-run)</h2>
        <p className="text-text-secondary">저장된 규칙 파일과 현재 레이아웃 초안 기준입니다. 저장하지 않은 자동 초안은 미매핑으로 계산됩니다.</p>
        {computeError && <p className="text-text-warning-label" role="alert">검증을 계산하지 못했습니다: {computeError}</p>}
        {!run && !computeError && <p>계산 중…</p>}
        {run && run.issues.length > 0 && (
          <ul className="list-disc pl-6 text-text-warning-label" aria-label="Publish를 막는 규칙 문제">
            {run.issues.map((issue) => <li key={JSON.stringify([issue.code, issue.path])}>{issue.code}: {issue.message}</li>)}
          </ul>
        )}
        {coverage && (
          <>
            <p>
              참조 {coverage.references.resolved}/{coverage.references.total} ({percent(coverage.references.ratio)}) ·
              {' '}alias {coverage.aliases.resolved}/{coverage.aliases.total} ({percent(coverage.aliases.ratio)}) ·
              {' '}assumed {percent(coverage.assumed.ratio)} · 무시 {coverage.ignored.aliases.length}
            </p>
            <h3>미매핑 alias</h3>
            {coverage.unmapped.length === 0 ? <p>미매핑 alias가 없습니다.</p> : (
              <ul aria-label="미매핑 alias">
                {coverage.unmapped.map(({ alias, references }) => <li key={alias}>{alias} · 영향도 {references}</li>)}
              </ul>
            )}
          </>
        )}
        {run?.mapping && (
          <>
            <h3>Mapping Conflict</h3>
            {conflicts.length === 0 ? <p>Mapping Conflict가 없습니다.</p> : (
              <ul className="m-0 list-none p-0" aria-label="Mapping Conflict">
                {conflicts.map((conflict) => (
                  <li key={conflictKey(conflict)} className="mb-1">
                    <Button type="button" variant={conflictKey(conflict) === active ? 'secondary' : 'outline'} size="sm"
                      aria-pressed={conflictKey(conflict) === active} onClick={() => toggle(conflict)}>
                      {describeConflict(conflict)}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section aria-labelledby={`${ids}-pub`}>
        <h2 id={`${ids}-pub`}>⑥ Publish</h2>
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
          <div>
            <p>{plan.diff.layout}</p>
            {plan.diff.binding.length > 0 && <ul aria-label="Binding 변경">{plan.diff.binding.map((line) => <li key={line}>{line}</li>)}</ul>}
            {plan.diff.entries.length > 0 && (
              <>
                <p>{diffCaption}</p>
                <DataTable label={diffCaption} columns={['alias', '변경', '이전', '이후']}>
                  {plan.diff.entries.map((entry) => (
                    <DataTable.Row key={entry.alias}>
                      <DataTable.Cell rowHeader>{entry.alias}</DataTable.Cell>
                      <DataTable.Cell>{{ added: '추가', removed: '삭제', changed: '변경' }[entry.change]}</DataTable.Cell>
                      <DataTable.Cell>{entry.before ?? '—'}</DataTable.Cell>
                      <DataTable.Cell>{entry.after ?? '—'}</DataTable.Cell>
                    </DataTable.Row>
                  ))}
                </DataTable>
              </>
            )}
            <p>변경 없음 {plan.diff.unchanged}건 · Mapping Conflict {plan.diff.conflicts}건 (게시를 막지 않습니다)</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="primary" aria-disabled={blocked} aria-describedby={reason ? reasonId : undefined} onClick={publish}>
            게시
          </Button>
          {reason && <span id={reasonId} className="text-text-secondary">{reason}</span>}
        </div>
        <p role="status" className="min-h-6 font-semibold">{status}</p>
      </section>

      <section aria-labelledby={`${ids}-model`}>
        <h2 id={`${ids}-model`}>같은 Model 일괄 dry-run</h2>
        <Button type="button" variant="outline" disabled={modelState?.loading} onClick={loadModel}>같은 Model 일괄 dry-run 실행</Button>
        {modelState?.loading && <p role="status">계산 중…</p>}
        {modelState?.error && <p className="text-text-warning-label" role="alert">{modelState.error}</p>}
        {modelState?.rows && (
          <>
            <p>{modelCaption}</p>
            <DataTable
              label={modelCaption}
              columns={['equipmentId', '상태', '참조 coverage', 'alias coverage', '충돌', '미매핑 참조', '막는 문제', '오류']}
            >
              {modelState.rows.map((row) => (
                <DataTable.Row key={row.equipmentId}>
                  <DataTable.Cell rowHeader>{renderLink(row.equipmentId)}</DataTable.Cell>
                  <DataTable.Cell>{row.status}</DataTable.Cell>
                  <DataTable.Cell>{percent(row.referenceRatio)}</DataTable.Cell>
                  <DataTable.Cell>{percent(row.aliasRatio)}</DataTable.Cell>
                  <DataTable.Cell>{count(row.conflicts)}</DataTable.Cell>
                  <DataTable.Cell>{count(row.unmappedReferences)}</DataTable.Cell>
                  <DataTable.Cell>{count(row.blockingIssues)}</DataTable.Cell>
                  <DataTable.Cell>{row.error ?? '—'}</DataTable.Cell>
                </DataTable.Row>
              ))}
            </DataTable>
          </>
        )}
      </section>
    </div>
  );
}
