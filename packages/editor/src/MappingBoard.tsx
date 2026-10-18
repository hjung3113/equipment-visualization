import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react';
import type { AliasRulesFile } from '@eqv/core';
import { Button, Dialog, DialogContent, DialogTitle, Input, Label, OutlineBadge, RadioGroup, RadioGroupItem } from '@fops/ui';
import { TopViewer, type TopViewerProps } from '@eqv/renderer';
import { ViewerZoomControls } from '@eqv/ui';
import {
  addPatternRule, applyEdit, applyEdits, applySaveOutcome, buildSavePayload, canRedo, canUndo, createBoardState, dirtyScopes, explainRow, isDirty,
  paletteOptions, previewPatternRule, redo, resolveBoard, suggestPattern, undo,
  type BoardEdit, type BoardInput, type BoardStatus, type BoardRow, type BoardState, type PatternPreview, type SaveOutcome, type SaveScope,
} from './board.js';

export interface MappingBoardProps extends BoardInput {
  /**
   * Writes the given scope files and reports each scope it wrote plus the first error. The editor never fetches or writes;
   * a rejection counts as no scope saved.
   */
  onSave(files: { scope: SaveScope; file: AliasRulesFile }[]): Promise<SaveOutcome>;
  onDirtyChange?(dirty: boolean): void;
  /** Rings and lines drawn over the Top View for a selected Mapping Conflict. */
  highlight?: TopViewerProps['highlight'];
}

const VIEW = { width: 560, height: 420 };
const LEVEL_TEXT: Record<string, string> = { global: '전역', maker: 'Maker', model: 'Model', equipment: '설비' };
const MARKED_NAME = ', 선택한 component에 배정됨';
const NOTE = 'mb-2 border-l-2 border-text-warning-label px-2 py-1 text-text-warning-label';
const ISSUES = 'mb-2 border-l-2 border-text-warning-label py-1 pr-2 pl-6 text-text-warning-label';
const PANE = 'min-w-0 rounded-md border border-border-subtle bg-surface-card p-2';
const STATUS_TONE: Record<BoardStatus, string> = {
  conflict: 'font-semibold text-text-danger-label', verified: 'text-accent-primary', assumed: 'text-text-warning-label',
  unmapped: 'text-text-secondary', ignored: 'text-text-secondary',
};
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);
const isModified = (event: KeyboardEvent) => event.ctrlKey || event.metaKey || event.altKey;

type Pick = { kind: 'alias' } | { kind: 'component'; id: string | null };
const OUTCOME_TEXT = (row: PatternPreview['rows'][number]): string => {
  const ids = row.ruleIds.join(', ');
  switch (row.outcome) {
    case 'applies': return '적용';
    case 'exception': return `예외 (정확 규칙 ${ids})`;
    case 'missing-target': return '대상 없음 (레이아웃에 없음)';
    case 'overlap': return `충돌 (${ids})`;
    case 'blocked': return `충돌 (더 좁은 범위: ${ids})`;
    case 'shadowed': return `우선 규칙 ${ids}`;
  }
};

export function MappingBoard(props: MappingBoardProps) {
  const { equipment, inventory, dictionaries, layout, ruleFiles, templates, onSave, onDirtyChange } = props;
  const [state, setState] = useState<BoardState>(() => createBoardState({ equipment, ruleFiles }));
  const [saveScope, setSaveScope] = useState<SaveScope>('model');
  const [alias, setAlias] = useState<string | null>(null);
  const [pick, setPick] = useState<Pick>({ kind: 'alias' });
  const [palette, setPalette] = useState<{ alias: string; filter: string; active: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedState, setSavedState] = useState<BoardState | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ state: BoardState; alias: string | null; scope: SaveScope; text: string } | null>(null);
  const [marks, setMarks] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState('');
  const [rule, setRule] = useState<{ alias: string; pattern: string; target: string; hint: boolean } | null>(null);
  const ids = useId();
  const saveStatusRef = useRef<HTMLSpanElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const patternRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const aliveRef = useRef(true);
  const savingRef = useRef(false);
  const restoreFocus = useRef(false);
  const dragAlias = useRef<string | null>(null);
  const reported = useRef(false);
  const onDirty = useRef(onDirtyChange);
  onDirty.current = onDirtyChange;

  const input = useMemo<BoardInput>(() => ({ equipment, inventory, dictionaries, layout, ruleFiles, templates }),
    [equipment, inventory, dictionaries, layout, ruleFiles, templates]);
  const view = useMemo(() => resolveBoard(input, state.present, saveScope, state.baseline), [input, state.present, state.baseline, saveScope]);
  const matchesQuery = (row: BoardRow, text: string) => {
    const needle = text.trim().toLowerCase();
    return !needle || [row.alias, row.moduleType ?? '', row.componentId ?? ''].some((value) => value.toLowerCase().includes(needle));
  };
  const groups = useMemo(() => view.groups.map((group) => ({ role: group.role, rows: group.rows.filter((row) => matchesQuery(row, query)) }))
    .filter((group) => group.rows.length > 0), [view, query]);
  const rows = groups.flatMap((group) => group.rows);
  const selected = rows.find((row) => row.alias === alias) ?? null;
  const markedRows = rows.filter((row) => marks.has(row.alias));
  const bulkRows = markedRows.length >= 2 || (markedRows.length === 1 && markedRows[0] !== selected) ? markedRows : null;
  const changedModelRules = [...new Set((bulkRows ?? []).flatMap((row) => row.changedModelRule ? [row.changedModelRule] : []))];
  const overriddenRows = (bulkRows ?? []).filter((row) => row.overriddenBy);
  const autoRows = rows.filter((row) => row.status === 'assumed');
  const preview = useMemo(() => rule ? previewPatternRule(input, state.present, saveScope, { pattern: rule.pattern, target: rule.target }) : null,
    [input, state.present, saveScope, rule]);
  const confirmReason = !selected ? null : !selected.target ? '배정된 대상이 없어 확정할 수 없습니다'
    : applyEdit(input, state, saveScope, { kind: 'confirm', alias: selected.alias }) === state
      ? selected.rule?.level === saveScope ? '저장 범위에 이미 verified 정확 규칙이 있습니다'
        : '저장 범위에 이미 같은 verified 정확 규칙이 있습니다' : null;
  const dirty = isDirty(state);
  const savePayload = useMemo(() => buildSavePayload(input, state, saveScope), [input, state, saveScope]);
  const canSave = savePayload.files.length > 0;
  const paletteOpen = palette !== null;
  const ruleOpen = rule !== null;
  const modalOpen = paletteOpen || ruleOpen;
  const viewerId = pick.kind === 'alias' ? selected?.componentId ?? null : pick.id;
  const options = useMemo(() => palette ? paletteOptions(layout, rows.find((row) => row.alias === palette.alias)?.role ?? 'unknown', palette.filter) : [],
    [layout, rows, palette]);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);
  useEffect(() => {
    if (reported.current === dirty) return;
    reported.current = dirty;
    onDirty.current?.(dirty);
  }, [dirty]);
  useEffect(() => {
    if (palette) filterRef.current?.focus();
    else if (rule) patternRef.current?.focus();
    else if (restoreFocus.current) {
      restoreFocus.current = false;
      listRef.current?.focus();
    }
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    const keepFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialogRef.current?.contains(event.target)) (filterRef.current ?? patternRef.current)?.focus();
    };
    document.addEventListener('focusin', keepFocus);
    return () => document.removeEventListener('focusin', keepFocus);
  }, [modalOpen]);

  useEffect(() => {
    const visible = new Set(groups.flatMap((group) => group.rows.map((row) => row.alias)));
    setMarks((current) => {
      const kept = [...current].filter((name) => visible.has(name));
      return kept.length === current.size ? current : new Set(kept);
    });
  }, [groups]);

  const optionId = (name: string) => `${ids}-alias-${name}`;
  const paletteOptionId = (id: string) => `${ids}-component-${id}`;
  const edit = (change: BoardEdit) => {
    if (savingRef.current) return;
    if (change.kind === 'confirm' && confirmReason) {
      setNotice({ state, alias: change.alias, scope: saveScope, text: confirmReason });
      return;
    }
    setState((current) => applyEdit(input, current, saveScope, change));
  };
  const select = (name: string) => {
    setAlias(name);
    setPick({ kind: 'alias' });
  };
  const move = (step: number, extend = false) => {
    if (!rows.length) return;
    const index = selected ? rows.indexOf(selected) : -1;
    const next = rows[Math.min(rows.length - 1, Math.max(0, index + step))]!.alias;
    if (extend) setMarks((current) => new Set([...current, ...(selected ? [selected.alias] : []), next]));
    select(next);
  };
  const toggleMark = (name: string) => setMarks((current) => {
    const next = new Set(current);
    if (!next.delete(name)) next.add(name);
    return next;
  });
  const onRowClick = (event: MouseEvent, row: BoardRow) => {
    if (event.metaKey || event.ctrlKey) setMarks((current) => {
      const next = new Set(current.size === 0 && selected && selected !== row ? [selected.alias] : current);
      if (!next.delete(row.alias)) next.add(row.alias);
      return next;
    });
    else if (event.shiftKey && selected) {
      const [from, to] = [rows.indexOf(selected), rows.indexOf(row)].sort((a, b) => a - b) as [number, number];
      setMarks((current) => new Set([...current, ...rows.slice(from, to + 1).map(({ alias: name }) => name)]));
    } else if (event.shiftKey) setMarks((current) => new Set([...current, row.alias]));
    else setMarks(new Set());
    select(row.alias);
  };
  const changeQuery = (text: string) => setQuery(text);
  const bulk = (targets: readonly BoardRow[], kind: 'confirm' | 'ignore') => {
    if (savingRef.current || !targets.length) return;
    const result = applyEdits(input, state, saveScope, targets.map((row) => ({ kind, alias: row.alias })), view);
    const skipped = result.skipped.length
      ? `, ${result.skipped.length}건 건너뜀 (${[...new Set(result.skipped.map(({ reason }) => reason))].join(', ')})` : '';
    const unchanged = result.unchanged.map(({ alias: name, overriddenBy }) =>
      overriddenBy ? `${name} (설비 규칙 ${overriddenBy} 우선)` : name);
    const unchangedText = unchanged.length ? ` · 결과가 바뀌지 않음: ${unchanged.join(', ')}` : '';
    setState(result.state);
    setNotice({ state: result.state, alias, scope: saveScope, text: `${result.applied.length}건 ${kind === 'confirm' ? '확정' : '무시'}${skipped}${unchangedText}` });
  };
  const openRule = () => {
    if (!selected || savingRef.current) return;
    const suggestion = suggestPattern(selected.alias, selected.componentId);
    setRule({ alias: selected.alias, pattern: suggestion?.pattern ?? '', target: suggestion?.target ?? '', hint: suggestion === null });
  };
  const returnFocusToList = (event: Event) => {
    event.preventDefault();
    listRef.current?.focus();
  };
  const closeRule = () => {
    restoreFocus.current = true;
    setRule(null);
  };
  const addRule = () => {
    if (!rule || !preview || savingRef.current || preview.problems.length) return;
    const next = addPatternRule(input, state, saveScope, { pattern: rule.pattern, target: rule.target });
    setState(next);
    setNotice({ state: next, alias, scope: saveScope, text: `규칙 ${preview.rule?.id} 추가${preview.removes.length ? ` · 정리 ${preview.removes.length}건` : ''}` });
    closeRule();
  };
  const openPalette = () => {
    if (selected && !savingRef.current) setPalette({ alias: selected.alias, filter: '', active: 0 });
  };
  const closePalette = () => {
    restoreFocus.current = true;
    setPalette(null);
  };
  const assignFromPalette = (componentId: string) => {
    if (!palette) return;
    edit({ kind: 'assign', alias: palette.alias, componentId });
    closePalette();
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (modalOpen || isModified(event)) return;
    const key = event.key;
    const plain = key.toLowerCase();
    if (plain === 'j' || key === 'ArrowDown') move(1, event.shiftKey);
    else if (plain === 'k' || key === 'ArrowUp') move(-1, event.shiftKey);
    else if (key === 'Enter') {
      if (bulkRows) bulk(bulkRows, 'confirm');
      else if (selected) edit({ kind: 'confirm', alias: selected.alias });
    }
    else if (key === ' ') { if (selected) toggleMark(selected.alias); }
    else if (key === 'Escape') { if (!marks.size) return; setMarks(new Set()); }
    else if (key === '/') searchRef.current?.focus();
    else if (plain === 'a') openPalette();
    else if (plain === 'r') openRule();
    else if (plain === 'i') {
      if (bulkRows) bulk(bulkRows, 'ignore');
      else if (selected) edit({ kind: 'ignore', alias: selected.alias });
    }
    else return;
    event.preventDefault();
  };

  const onRootKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || modalOpen || savingRef.current || !(event.metaKey || event.ctrlKey)) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="radio"]')) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) setState(undo);
    else if ((key === 'z' && event.shiftKey) || (key === 'y' && event.ctrlKey)) setState(redo);
    else return;
    event.preventDefault();
  };

  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = event.key;
    if (key === 'Escape') closePalette();
    else if (key === 'ArrowDown' || key === 'ArrowUp') {
      if (!options.length) return;
      const step = key === 'ArrowDown' ? 1 : -1;
      setPalette((current) => current && { ...current, active: (Math.min(current.active, options.length - 1) + step + options.length) % options.length });
    } else if (key === 'Enter' && event.target === filterRef.current) {
      const option = options[Math.min(palette?.active ?? 0, options.length - 1)];
      if (option) assignFromPalette(option.id);
    } else if (key === 'Tab') {
      if (!trapTab(event)) return;
    } else return;
    event.preventDefault();
    event.stopPropagation();
  };
  const trapTab = (event: KeyboardEvent<HTMLDivElement>): boolean => {
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('input, button') ?? []);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return false;
    if (event.shiftKey && document.activeElement === first) last.focus();
    else if (!event.shiftKey && document.activeElement === last) first.focus();
    else return false;
    return true;
  };
  const onRuleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = event.key;
    if (key === 'Escape') closeRule();
    else if (key === 'Enter' && event.target instanceof HTMLInputElement) addRule();
    else if (key === 'Tab') {
      if (!trapTab(event)) return;
    } else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const componentAt = (event: DragEvent): string | null => {
    const hit = event.target instanceof Element ? event.target.closest('[data-component-id]:not([data-hidden="true"])') : null;
    return hit && viewRef.current?.contains(hit) ? hit.getAttribute('data-component-id') : null;
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    const target = componentAt(event);
    const name = dragAlias.current ?? event.dataTransfer?.getData('text/plain') ?? null;
    dragAlias.current = null;
    if (!target || !name || modalOpen || savingRef.current || !rows.some((row) => row.alias === name)) return;
    event.preventDefault();
    select(name);
    edit({ kind: 'assign', alias: name, componentId: target });
  };

  const save = async () => {
    if (savingRef.current || !canSave) return;
    saveStatusRef.current?.focus();
    const payload = savePayload;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    let outcome: SaveOutcome;
    try {
      outcome = await onSave(payload.files);
    } catch (error) {
      outcome = { savedScopes: [], error: messageOf(error) };
    } finally {
      savingRef.current = false;
    }
    if (!aliveRef.current) return;
    const next = applySaveOutcome(state, payload, outcome);
    setState(next);
    setSavedState(!outcome.error && payload.files.every(({ scope }) => outcome.savedScopes.includes(scope)) ? next : null);
    setSaveError(outcome.error ?? null);
    setSaving(false);
  };

  const lines = selected ? explainRow(selected) : [];
  const status = dirty ? `저장 안 됨 · ${dirtyScopes(state).map((scope) => LEVEL_TEXT[scope]).join(', ')}` : view.drafts.length ? `초안 ${view.drafts.length}건 (저장하면 assumed 규칙으로 기록)` : state === savedState ? '저장됨' : '변경 없음';
  const targetText = (row: BoardRow) => {
    if (!row.componentId) return '—';
    const component = layout.components.find(({ id }) => id === row.componentId);
    if (!component) return `${row.componentId} (레이아웃에 없음)`;
    return component.label === component.id ? component.id : `${component.id} · ${component.label}`;
  };
  const marked = (row: BoardRow) => viewerId !== null && layout.components.some(({ id }) => id === viewerId) && row.componentId === viewerId;

  return (
    <section aria-label="④ Mapping Board" onKeyDown={onRootKeyDown}>
      <div inert={modalOpen} onClickCapture={(event) => {
        if (modalOpen) { event.preventDefault(); event.stopPropagation(); }
      }}>
      <p className="mb-3 text-xs text-text-muted">j/k 이동 · Shift 선택 확장 · Space 선택 · Enter 확정 · A 배정 · I 무시 · R 규칙화 · / 검색 · ⌘Z/⇧⌘Z</p>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <span aria-hidden="true" className="font-semibold">저장 범위</span>
          <RadioGroup aria-label="저장 범위" className="flex flex-wrap" value={saveScope} disabled={saving} onValueChange={(value) => setSaveScope(value as SaveScope)}>
            {([['model', `Model (${equipment.maker}/${equipment.model})`], ['equipment', `설비 (${equipment.equipmentId})`]] as const).map(([scope, label]) => (
              <div key={scope} className="flex items-center gap-2">
                <RadioGroupItem id={`${ids}-scope-${scope}`} value={scope} />
                <Label htmlFor={`${ids}-scope-${scope}`}>{label}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={saving || !canUndo(state)} onClick={() => setState(undo)}>실행 취소</Button>
        <Button type="button" variant="outline" size="sm" disabled={saving || !canRedo(state)} onClick={() => setState(redo)}>다시 실행</Button>
        <Button type="button" variant="outline" size="sm" disabled={saving || autoRows.length === 0} aria-describedby={`${ids}-auto-warnings`} onClick={() => bulk(autoRows, 'confirm')}>자동 일괄 확정 ({autoRows.length})</Button>
        <Button type="button" variant="primary" size="sm" disabled={saving || !canSave} onClick={save}>저장</Button>
        <span ref={saveStatusRef} role="status" tabIndex={-1}>{saving ? '저장 중…' : notice?.state === state && notice.alias === alias && notice.scope === saveScope ? notice.text : status}</span>
        {saveError && <span role="alert" className="font-semibold text-text-danger-label">{saveError}</span>}
      </div>
      <div id={`${ids}-auto-warnings`}>
        {saveScope === 'model' && <p className={NOTE}>Model 범위에 저장: {equipment.maker}/{equipment.model}의 모든 설비에 적용됩니다</p>}
        {saveScope === 'model' && autoRows.some((row) => row.changedModelRule) && <p className={NOTE}>Model 규칙을 바꿉니다: {[...new Set(autoRows.flatMap((row) => row.changedModelRule ? [row.changedModelRule] : []))].join(', ')} — {equipment.maker}/{equipment.model}의 모든 설비에 적용됩니다</p>}
        {autoRows.some((row) => row.overriddenBy) && <p className={NOTE}>설비 범위 규칙이 우선하는 alias: {autoRows.filter((row) => row.overriddenBy).map((row) => `${row.alias} (${row.overriddenBy})`).join(', ')} — 확정·무시하려면 저장 범위를 설비로 바꾸세요</p>}
      </div>
      {view.missingTemplate && <p className={NOTE}>Template {view.missingTemplate}을(를) 찾을 수 없어 자동 배정이 없습니다.</p>}
      {view.unattributed.length > 0 && (
        <ul className={ISSUES} aria-label="규칙 문제">
          {view.unattributed.map((issue) => <li key={JSON.stringify([issue.code, issue.path])}>{issue.code}: {issue.message}</li>)}
        </ul>
      )}
      <div className="grid grid-cols-3 items-start gap-3 max-[1100px]:grid-cols-1">
        <div className={PANE}>
          <Input
            ref={searchRef} type="search" aria-label="Alias 검색" placeholder="/ 검색" value={query}
            onChange={(event) => changeQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') { changeQuery(''); listRef.current?.focus(); }
              else if (event.key === 'Enter' || event.key === 'ArrowDown') listRef.current?.focus();
              else return;
              event.preventDefault();
            }}
          />
          <div
            ref={listRef} role="listbox" tabIndex={0} aria-label="Alias 목록" className="mt-2 max-h-[480px] overflow-y-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring" aria-multiselectable="true"
            aria-activedescendant={selected ? optionId(selected.alias) : undefined} onKeyDown={onListKeyDown}
          >
            {groups.map((group) => (
              <div key={group.role} role="group" aria-label={`Role ${group.role}`}>
                <div className="px-1 pt-1 pb-0.5 font-semibold text-text-secondary" aria-hidden="true">{group.role}</div>
                {group.rows.map((row) => (
                  <div
                    key={row.alias} id={optionId(row.alias)} role="option" aria-selected={markedRows.length ? marks.has(row.alias) : row === selected} draggable={!saving}
                    className={`flex items-baseline gap-2 px-2 py-1 ${saving ? 'cursor-pointer' : 'cursor-grab'} ${row === selected ? 'bg-surface-row-selected outline outline-2 -outline-offset-2 outline-accent-primary' : marks.has(row.alias) ? 'border-l-2 border-l-accent-primary bg-surface-canvas' : 'border-l-2 border-l-transparent'}`}
                    aria-label={`${row.alias}, ${row.statusText}, ${row.componentId ? targetText(row) : '배정 없음'}${marked(row) ? MARKED_NAME : ''}${marks.has(row.alias) ? ', 일괄 선택됨' : ''}`}
                    onClick={(event) => onRowClick(event, row)}
                    onDragStart={(event) => {
                      dragAlias.current = row.alias;
                      event.dataTransfer?.setData('text/plain', row.alias);
                      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
                    }}
                    onDragEnd={() => { dragAlias.current = null; }}
                  >
                    {row === selected && <span aria-hidden="true">▸</span>}
                    <span className="flex-auto font-semibold">{row.alias}</span>
                    <span className={`whitespace-nowrap ${STATUS_TONE[row.status]}`}>{row.statusText}</span>
                    <span className="min-w-16 text-right tabular-nums">{targetText(row)}</span>
                    {marks.has(row.alias) && <span className="text-accent-primary" aria-hidden="true">✓</span>}
                    {marked(row) && <span className="text-accent-primary" aria-hidden="true">◆</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {rows.length === 0 && <p>일치하는 alias가 없습니다</p>}
        </div>
        <div className="min-w-0 max-w-full overflow-auto rounded-md border border-border-subtle bg-surface-canvas" ref={viewRef} onDragOver={(event) => { if (dragAlias.current && componentAt(event)) event.preventDefault(); }} onDrop={onDrop}>
          <TopViewer
            layout={layout} width={VIEW.width} height={VIEW.height} selectedId={viewerId}
            onSelectedChange={(id) => setPick({ kind: 'component', id })} highlight={props.highlight ?? null}
            renderControls={(controls) => <ViewerZoomControls controls={controls} labels={{ zoomIn: '확대', zoomOut: '축소', fit: '맞춤' }} />}
          />
        </div>
        <div className={PANE} aria-label="선택한 항목" role="region">
          {bulkRows ? (
            <>
              <h3 className="mb-2 font-semibold">{bulkRows.length}개 선택</h3>
              {changedModelRules.length > 0 && <p className={NOTE}>Model 규칙을 바꿉니다: {changedModelRules.join(', ')} — {equipment.maker}/{equipment.model}의 모든 설비에 적용됩니다</p>}
              {overriddenRows.length > 0 && <p className={NOTE}>설비 범위 규칙이 우선하는 alias: {overriddenRows.map((row) => `${row.alias} (${row.overriddenBy})`).join(', ')} — 확정·무시하려면 저장 범위를 설비로 바꾸세요</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => bulk(bulkRows, 'confirm')}>일괄 확정 (Enter)</Button>
                <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => bulk(bulkRows, 'ignore')}>일괄 무시 (I)</Button>
              </div>
            </>
          ) : selected ? (
            <>
              <h3 className="mb-2 font-semibold">{selected.alias}</h3>
              <dl className="mb-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5">
                <dt className="text-text-secondary">ModuleType</dt><dd className="break-words">{selected.moduleType ?? '—'}</dd>
                <dt className="text-text-secondary">Role</dt><dd className="break-words">{selected.role}</dd>
                <dt className="text-text-secondary">slots</dt><dd className="break-words">{selected.slots.length ? selected.slots.join(', ') : '—'}</dd>
                <dt className="text-text-secondary">상태</dt><dd className="break-words">{selected.statusText}</dd>
                <dt className="text-text-secondary">대상 component</dt><dd className="break-words">{targetText(selected)}</dd>
                <dt className="text-text-secondary">규칙</dt>
                <dd className="break-words">{selected.draft ? `초안 (저장 시 ${selected.rule?.ruleId})` : selected.rule ? `${LEVEL_TEXT[selected.rule.level] ?? selected.rule.level} · ${selected.rule.ruleId} · ${selected.rule.kind === 'exact' ? '정확' : '패턴'}` : '—'}</dd>
                <dt className="text-text-secondary">확실성</dt><dd className="break-words">{selected.certainty ?? '—'}</dd>
              </dl>
              {saveScope === 'model' && selected.changedModelRule && <p className={NOTE}>Model 규칙 {selected.changedModelRule}을(를) 바꿉니다: {equipment.maker}/{equipment.model}의 모든 설비에 적용됩니다</p>}
              {selected.rule?.level === 'model' && selected.issues.some(({ code }) => code === 'unknown-target') && <p className={NOTE}>이 설비만 다르면 저장 범위를 설비로 바꾸세요</p>}
              {selected.overriddenBy && <p className={NOTE}>설비 범위 규칙({selected.overriddenBy})이 우선합니다. 확정하려면 저장 범위를 설비로 바꾸세요.</p>}
              {lines.length > 0 && <ul className={ISSUES} aria-label="충돌과 문제">{lines.map((line) => <li key={line}>{line}</li>)}</ul>}
              {confirmReason && <p id={`${ids}-confirm-reason`} className={NOTE}>{confirmReason}</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={saving} onClick={openPalette}>배정 (A)</Button>
                <Button type="button" variant="outline" size="sm" disabled={saving} aria-disabled={saving || !!confirmReason} aria-describedby={confirmReason ? `${ids}-confirm-reason` : undefined} onClick={() => edit({ kind: 'confirm', alias: selected.alias })}>확정 (Enter)</Button>
                <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => edit({ kind: 'ignore', alias: selected.alias })}>무시 (I)</Button>
                <Button type="button" variant="outline" size="sm" disabled={saving} onClick={openRule}>규칙화 (R)</Button>
              </div>
            </>
          ) : <p>왼쪽에서 alias를 선택하세요.</p>}
        </div>
      </div>
      </div>
      {palette && (
        <Dialog open onOpenChange={(open) => { if (!open) closePalette(); }}>
        <DialogContent
          ref={dialogRef} closeLabel="창 닫기" aria-modal="true" aria-describedby={undefined} className="w-[420px] max-w-[min(420px,calc(100vw-32px))]"
          onKeyDown={onDialogKeyDown} onInteractOutside={(event) => event.preventDefault()} onCloseAutoFocus={returnFocusToList}
        >
          <DialogTitle>{palette.alias}를 배정할 component</DialogTitle>
          <Input
            ref={filterRef} type="text" role="combobox" aria-label="component 필터" aria-expanded="true" aria-autocomplete="list"
            aria-controls={`${ids}-palette-list`} value={palette.filter}
            aria-activedescendant={options.length ? paletteOptionId(options[Math.min(palette.active, options.length - 1)]!.id) : undefined}
            onChange={(event) => setPalette({ ...palette, filter: event.target.value, active: 0 })}
          />
          <div id={`${ids}-palette-list`} role="listbox" aria-label="component 목록" className="my-2 max-h-[260px] overflow-y-auto border border-border-subtle">
            {options.map((option, index) => (
              <div
                key={option.id} id={paletteOptionId(option.id)} role="option" aria-selected={index === Math.min(palette.active, options.length - 1)}
                className={`cursor-pointer px-2 py-1 ${index === Math.min(palette.active, options.length - 1) ? 'bg-surface-row-selected' : ''}`}
                onClick={() => assignFromPalette(option.id)}
              >
                <code>{option.id}</code> {option.label} <OutlineBadge>{option.role}</OutlineBadge>
              </div>
            ))}
            {options.length === 0 && <p>일치하는 component가 없습니다.</p>}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={closePalette}>닫기</Button>
        </DialogContent>
        </Dialog>
      )}
      {rule && preview && (
        <Dialog open onOpenChange={(open) => { if (!open) closeRule(); }}>
        <DialogContent
          ref={dialogRef} closeLabel="창 닫기" aria-modal="true" aria-describedby={undefined}
          className="max-h-[80vh] w-[560px] max-w-[min(560px,calc(100vw-32px))] overflow-y-auto"
          onKeyDown={onRuleKeyDown} onInteractOutside={(event) => event.preventDefault()} onCloseAutoFocus={returnFocusToList}
        >
          <DialogTitle>{rule.alias}에서 규칙 만들기 · 저장 범위 {LEVEL_TEXT[saveScope]}</DialogTitle>
          {rule.hint && <p className={NOTE}>패턴을 제안할 숫자가 없습니다</p>}
          <div className="mb-2">
            <Label htmlFor={`${ids}-rule-pattern`}>패턴</Label>
            <Input id={`${ids}-rule-pattern`} ref={patternRef} type="text" value={rule.pattern} onChange={(event) => setRule({ ...rule, pattern: event.target.value })} />
          </div>
          <div className="mb-2">
            <Label htmlFor={`${ids}-rule-target`}>대상 component</Label>
            <Input id={`${ids}-rule-target`} type="text" value={rule.target} onChange={(event) => setRule({ ...rule, target: event.target.value })} />
          </div>
          <p role="status">{preview.summary}</p>
          <ul className="mb-2 max-h-[200px] overflow-y-auto pl-5 tabular-nums" aria-label="규칙 미리보기">
            {preview.rows.map((row) => <li key={row.alias}>{row.alias} → {row.target} · {OUTCOME_TEXT(row)}</li>)}
          </ul>
          {preview.removes.length > 0 && <p>정리되는 정확 규칙: {preview.removes.join(', ')}</p>}
          {preview.problems.length > 0 && (
            <ul className={ISSUES} aria-label="규칙 문제">
              {preview.problems.map((problem, index) => <li key={problem} id={index === 0 ? `${ids}-rule-problem` : undefined}>{problem}</li>)}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button" variant="primary" size="sm" disabled={saving} aria-disabled={saving || preview.problems.length > 0}
              aria-describedby={preview.problems.length ? `${ids}-rule-problem` : undefined} onClick={addRule}
            >규칙 추가</Button>
            <Button type="button" variant="outline" size="sm" onClick={closeRule}>닫기</Button>
          </div>
        </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
