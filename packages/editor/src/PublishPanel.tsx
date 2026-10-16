import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { BindingsFile, MappingConflict, MappingVersion } from '@eqv/core';
import type { TopViewerProps } from '@eqv/renderer';
import { describeConflict } from './conflict-text.js';
import {
  conflictHighlight, defaultEffectiveFrom, dryRun, planPublish, shortHash,
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
  onModelDryRun(): Promise<ModelDryRunRow[]>;
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
  const computeRef = useRef(compute);
  computeRef.current = compute;
  useEffect(() => {
    let current = true;
    computeRef.current().then(
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
  const [from, setFrom] = useState({ prefill, value: receipt?.effectiveFrom ?? prefill });
  const [active, setActive] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [model, setModel] = useState<{ equipmentId: string; rows: ModelDryRunRow[] | null; error: string | null; loading: boolean } | null>(null);
  const alive = useRef(true);
  const busy = useRef(false);
  const modelRequest = useRef(0);
  const activeRef = useRef<string | null>(null);
  const highlightRef = useRef(onHighlight);
  highlightRef.current = onHighlight;
  activeRef.current = active;
  if (from.prefill !== prefill) setFrom({ prefill, value: prefill });
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

  const dry = useComputed<DryRun>(inputs, () => dryRun(input));
  const planned = useComputed<PublishPlan>([...inputs, bindings, previous, effectiveFrom],
    () => planPublish({ ...input, bindings, previous, effectiveFrom }));
  const run = dry && 'value' in dry ? dry.value : null;
  const plan = planned && 'value' in planned ? planned.value : null;
  const computeError = (dry && 'error' in dry ? dry.error : null) ?? (planned && 'error' in planned ? planned.error : null);

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
  const effectiveError = completed ? null : plan?.problems.find((problem) => problem.startsWith('effectiveFrom')) ?? null;
  const reason = boardDirty ? DIRTY_REASON : !plan ? (computeError ?? '계산 중…')
    : completed ? '이전 게시와 같습니다' : plan.problems.join(' · ') || null;
  const blocked = reason !== null || publishing;
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
    setModel({ equipmentId, rows: null, error: null, loading: true });
    try {
      const rows = await onModelDryRun();
      if (alive.current && request === modelRequest.current) setModel({ equipmentId, rows, error: null, loading: false });
    } catch (error) {
      if (alive.current && request === modelRequest.current) setModel({ equipmentId, rows: null, error: messageOf(error), loading: false });
    }
  };
  const modelState = model && model.equipmentId === equipment.equipmentId ? model : null;

  const status = publishing ? '게시 중…' : failure ?? (receipt ? `게시됨 · ${shortHash(receipt.mappingHash)} · ${receipt.effectiveFrom}` : '');
  const coverage = run?.coverage;

  return (
    <div className="eqv-ed-publish">
      <section aria-labelledby={`${ids}-dry`} className="eqv-ed-section">
        <h2 id={`${ids}-dry`}>⑤ 검증 (dry-run)</h2>
        <p className="eqv-ed-hint">저장된 규칙 파일과 현재 레이아웃 초안 기준입니다. 저장하지 않은 자동 초안은 미매핑으로 계산됩니다.</p>
        {computeError && <p className="eqv-ed-note" role="alert">검증을 계산하지 못했습니다: {computeError}</p>}
        {!run && !computeError && <p>계산 중…</p>}
        {run && run.issues.length > 0 && (
          <ul className="eqv-ed-board-issues" aria-label="Publish를 막는 규칙 문제">
            {run.issues.map((issue) => <li key={JSON.stringify([issue.code, issue.path])}>{issue.code}: {issue.message}</li>)}
          </ul>
        )}
        {coverage && (
          <>
            <p className="eqv-ed-coverage">
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
              <ul className="eqv-ed-conflicts" aria-label="Mapping Conflict">
                {conflicts.map((conflict) => (
                  <li key={conflictKey(conflict)}>
                    <button type="button" className="eqv-ed-btn" aria-pressed={conflictKey(conflict) === active} onClick={() => toggle(conflict)}>
                      {describeConflict(conflict)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section aria-labelledby={`${ids}-pub`} className="eqv-ed-section">
        <h2 id={`${ids}-pub`}>⑥ Publish</h2>
        <p>
          <label>
            effectiveFrom{' '}
            <input
              type="text" value={effectiveFrom} spellCheck={false} aria-invalid={effectiveError !== null}
              aria-describedby={effectiveError ? errorId : undefined}
              onChange={(event) => setFrom({ prefill, value: event.target.value })}
            />
          </label>
          {effectiveError && <span id={errorId} className="eqv-ed-error"> {effectiveError}</span>}
        </p>
        {plan && (
          <div className="eqv-ed-diff">
            <p>{plan.diff.layout}</p>
            {plan.diff.binding.length > 0 && <ul aria-label="Binding 변경">{plan.diff.binding.map((line) => <li key={line}>{line}</li>)}</ul>}
            {plan.diff.entries.length > 0 && (
              <div className="eqv-ed-table-scroll" tabIndex={0} role="region" aria-label="Mapping 변경 표">
                <table className="eqv-ed-table">
                  <caption>Mapping Version 변경 {plan.diff.entries.length}건</caption>
                  <thead><tr>{['alias', '변경', '이전', '이후'].map((name) => <th key={name} scope="col">{name}</th>)}</tr></thead>
                  <tbody>
                    {plan.diff.entries.map((entry) => (
                      <tr key={entry.alias}>
                        <th scope="row">{entry.alias}</th>
                        <td>{{ added: '추가', removed: '삭제', changed: '변경' }[entry.change]}</td>
                        <td>{entry.before ?? '—'}</td>
                        <td>{entry.after ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p>변경 없음 {plan.diff.unchanged}건 · Mapping Conflict {plan.diff.conflicts}건 (게시를 막지 않습니다)</p>
          </div>
        )}
        <p>
          <button type="button" className="eqv-ed-btn eqv-ed-btn-primary" aria-disabled={blocked} aria-describedby={reason ? reasonId : undefined} onClick={publish}>
            게시
          </button>
          {reason && <span id={reasonId} className="eqv-ed-hint"> {reason}</span>}
        </p>
        <p role="status" className="eqv-ed-publish-status">{status}</p>
      </section>

      <section aria-labelledby={`${ids}-model`} className="eqv-ed-section">
        <h2 id={`${ids}-model`}>같은 Model 일괄 dry-run</h2>
        <button type="button" className="eqv-ed-btn" disabled={modelState?.loading} onClick={loadModel}>같은 Model 일괄 dry-run 실행</button>
        {modelState?.loading && <p role="status">계산 중…</p>}
        {modelState?.error && <p className="eqv-ed-note" role="alert">{modelState.error}</p>}
        {modelState?.rows && (
          <div className="eqv-ed-table-scroll" tabIndex={0} role="region" aria-label="같은 Model dry-run 표">
            <table className="eqv-ed-table">
              <caption>{equipment.maker}/{equipment.model} 설비 {modelState.rows.length}대</caption>
              <thead>
                <tr>{['equipmentId', '상태', '참조 coverage', 'alias coverage', '충돌', '미매핑 참조', '막는 문제', '오류'].map((name) =>
                  <th key={name} scope="col">{name}</th>)}</tr>
              </thead>
              <tbody>
                {modelState.rows.map((row) => (
                  <tr key={row.equipmentId}>
                    <th scope="row">{renderLink(row.equipmentId)}</th>
                    <td>{row.status}</td>
                    <td>{percent(row.referenceRatio)}</td>
                    <td>{percent(row.aliasRatio)}</td>
                    <td>{count(row.conflicts)}</td>
                    <td>{count(row.unmappedReferences)}</td>
                    <td>{count(row.blockingIssues)}</td>
                    <td>{row.error ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
