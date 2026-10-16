import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import type { AliasRulesFile } from '@eqv/core';
import { TopViewer } from '@eqv/renderer';
import {
  applyEdit, applySaveOutcome, buildSavePayload, canRedo, canUndo, createBoardState, explainRow, isDirty, paletteOptions,
  redo, resolveBoard, undo, type BoardEdit, type BoardInput, type BoardRow, type BoardState, type SaveOutcome, type SaveScope,
} from './board.js';

export interface MappingBoardProps extends BoardInput {
  /**
   * Writes the given scope files and reports each scope it wrote plus the first error. The editor never fetches or writes;
   * a rejection counts as no scope saved.
   */
  onSave(files: { scope: SaveScope; file: AliasRulesFile }[]): Promise<SaveOutcome>;
  onDirtyChange?(dirty: boolean): void;
}

const VIEW = { width: 560, height: 420 };
const LEVEL_TEXT: Record<string, string> = { global: '전역', maker: 'Maker', model: 'Model', equipment: '설비' };
const MARKED_NAME = ', 선택한 component에 배정됨';
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);
const isModified = (event: KeyboardEvent) => event.ctrlKey || event.metaKey || event.altKey;

type Pick = { kind: 'alias' } | { kind: 'component'; id: string | null };

export function MappingBoard(props: MappingBoardProps) {
  const { equipment, inventory, dictionaries, layout, ruleFiles, templates, onSave, onDirtyChange } = props;
  const [state, setState] = useState<BoardState>(() => createBoardState({ equipment, ruleFiles }));
  const [saveScope, setSaveScope] = useState<SaveScope>('model');
  const [alias, setAlias] = useState<string | null>(null);
  const [pick, setPick] = useState<Pick>({ kind: 'alias' });
  const [palette, setPalette] = useState<{ alias: string; filter: string; active: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const ids = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
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
  const view = useMemo(() => resolveBoard(input, state.present, saveScope), [input, state.present, saveScope]);
  const rows = view.groups.flatMap((group) => group.rows);
  const selected = rows.find((row) => row.alias === alias) ?? null;
  const dirty = isDirty(state);
  const savePayload = useMemo(() => buildSavePayload(input, state, saveScope), [input, state, saveScope]);
  const canSave = savePayload.files.length > 0;
  const paletteOpen = palette !== null;
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
    else if (restoreFocus.current) {
      restoreFocus.current = false;
      listRef.current?.focus();
    }
  }, [paletteOpen]);

  const optionId = (name: string) => `${ids}-alias-${name}`;
  const paletteOptionId = (id: string) => `${ids}-component-${id}`;
  const edit = (change: BoardEdit) => {
    if (savingRef.current) return;
    setState((current) => applyEdit(input, current, saveScope, change));
  };
  const select = (name: string) => {
    setAlias(name);
    setPick({ kind: 'alias' });
  };
  const move = (step: number) => {
    if (!rows.length) return;
    const index = selected ? rows.indexOf(selected) : -1;
    select(rows[Math.min(rows.length - 1, Math.max(0, index + step))]!.alias);
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
    if (isModified(event)) return;
    const key = event.key;
    if (key === 'j' || key === 'ArrowDown') move(1);
    else if (key === 'k' || key === 'ArrowUp') move(-1);
    else if (key === 'Enter') { if (selected) edit({ kind: 'confirm', alias: selected.alias }); }
    else if (key === 'a') openPalette();
    else if (key === 'i') { if (selected) edit({ kind: 'ignore', alias: selected.alias }); }
    else return;
    event.preventDefault();
  };

  const onRootKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || savingRef.current || !(event.metaKey || event.ctrlKey)) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return;
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
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('input, button') ?? []);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) last.focus();
      else if (!event.shiftKey && document.activeElement === last) first.focus();
      else return;
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
    if (!target || !name || savingRef.current || !rows.some((row) => row.alias === name)) return;
    event.preventDefault();
    select(name);
    edit({ kind: 'assign', alias: name, componentId: target });
  };

  const save = async () => {
    if (savingRef.current || !canSave) return;
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
    setState((current) => applySaveOutcome(current, payload, outcome));
    setSaveError(outcome.error ?? null);
    setSaving(false);
  };

  const lines = selected ? explainRow(selected) : [];
  const status = saveError ? null : canSave ? '저장 안 됨' : '저장됨';
  const marked = (row: BoardRow) => viewerId !== null && row.componentId === viewerId;

  return (
    <section className="eqv-ed-board" aria-labelledby={`${ids}-heading`} onKeyDown={onRootKeyDown}>
      <h2 id={`${ids}-heading`}>④ Mapping Board</h2>
      <div className="eqv-ed-board-bar">
        <fieldset className="eqv-ed-board-scope" disabled={saving}>
          <legend>저장 범위</legend>
          {([['model', `Model (${equipment.maker}/${equipment.model})`], ['equipment', `설비 (${equipment.equipmentId})`]] as const).map(([scope, label]) => (
            <label key={scope}>
              <input type="radio" name={`${ids}-scope`} checked={saveScope === scope} disabled={saving} onChange={() => setSaveScope(scope)} /> {label}
            </label>
          ))}
        </fieldset>
        <button type="button" className="eqv-ed-btn" disabled={saving || !canUndo(state)} onClick={() => setState(undo)}>실행 취소</button>
        <button type="button" className="eqv-ed-btn" disabled={saving || !canRedo(state)} onClick={() => setState(redo)}>다시 실행</button>
        <button type="button" className="eqv-ed-btn eqv-ed-btn-primary" disabled={saving || !canSave} onClick={save}>저장</button>
        {saveError ? <span role="alert" className="eqv-ed-error">{saveError}</span> : <span role="status">{saving ? '저장 중…' : status}</span>}
      </div>
      {view.missingTemplate && <p className="eqv-ed-note">Template {view.missingTemplate}을(를) 찾을 수 없어 자동 배정이 없습니다.</p>}
      {view.unattributed.length > 0 && (
        <ul className="eqv-ed-board-issues" aria-label="규칙 문제">
          {view.unattributed.map((issue) => <li key={JSON.stringify([issue.code, issue.path])}>{issue.code}: {issue.message}</li>)}
        </ul>
      )}
      <div className="eqv-ed-board-panes">
        <div className="eqv-ed-board-pane">
          <div
            ref={listRef} role="listbox" tabIndex={0} aria-label="Alias 목록" className="eqv-ed-board-list"
            aria-activedescendant={selected ? optionId(selected.alias) : undefined} onKeyDown={onListKeyDown}
          >
            {view.groups.map((group) => (
              <div key={group.role} role="group" aria-label={`Role ${group.role}`}>
                <div className="eqv-ed-board-group" aria-hidden="true">{group.role}</div>
                {group.rows.map((row) => (
                  <div
                    key={row.alias} id={optionId(row.alias)} role="option" aria-selected={row === selected} draggable={!saving}
                    className={`eqv-ed-board-row eqv-ed-bstatus-${row.status}${row === selected ? ' eqv-ed-selected' : ''}${marked(row) ? ' eqv-ed-marked' : ''}`}
                    aria-label={`${row.alias}, ${row.statusText}, ${row.componentId ?? '배정 없음'}${marked(row) ? MARKED_NAME : ''}`}
                    onClick={() => select(row.alias)}
                    onDragStart={(event) => {
                      dragAlias.current = row.alias;
                      event.dataTransfer?.setData('text/plain', row.alias);
                      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
                    }}
                    onDragEnd={() => { dragAlias.current = null; }}
                  >
                    <span className="eqv-ed-board-alias">{row.alias}</span>
                    <span className="eqv-ed-board-status">{row.statusText}</span>
                    <span className="eqv-ed-board-target">{row.componentId ?? '—'}</span>
                    {marked(row) && <span className="eqv-ed-board-marker" aria-hidden="true">◆</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="eqv-ed-board-pane eqv-ed-board-view" ref={viewRef} onDragOver={(event) => { if (dragAlias.current && componentAt(event)) event.preventDefault(); }} onDrop={onDrop}>
          <TopViewer
            layout={layout} width={VIEW.width} height={VIEW.height} selectedId={viewerId}
            onSelectedChange={(id) => setPick({ kind: 'component', id })}
          />
        </div>
        <div className="eqv-ed-board-pane" aria-label="선택한 항목" role="region">
          {selected ? (
            <>
              <h3>{selected.alias}</h3>
              <dl className="eqv-ed-board-detail">
                <dt>ModuleType</dt><dd>{selected.moduleType ?? '—'}</dd>
                <dt>Role</dt><dd>{selected.role}</dd>
                <dt>slots</dt><dd>{selected.slots.length ? selected.slots.join(', ') : '—'}</dd>
                <dt>상태</dt><dd>{selected.statusText}</dd>
                <dt>대상 component</dt><dd>{selected.componentId ?? '—'}</dd>
                <dt>규칙</dt>
                <dd>{selected.rule ? `${LEVEL_TEXT[selected.rule.level] ?? selected.rule.level} · ${selected.rule.ruleId} · ${selected.rule.kind === 'exact' ? '정확' : '패턴'}` : '—'}</dd>
                <dt>certainty</dt><dd>{selected.certainty ?? '—'}</dd>
              </dl>
              {selected.overriddenBy && <p className="eqv-ed-note">설비 범위 규칙({selected.overriddenBy})이 우선합니다</p>}
              {lines.length > 0 && <ul className="eqv-ed-board-issues" aria-label="충돌과 문제">{lines.map((line) => <li key={line}>{line}</li>)}</ul>}
              <div className="eqv-ed-board-actions">
                <button type="button" className="eqv-ed-btn" disabled={saving} onClick={openPalette}>배정 (A)</button>
                <button type="button" className="eqv-ed-btn" disabled={saving} onClick={() => edit({ kind: 'confirm', alias: selected.alias })}>확정 (Enter)</button>
                <button type="button" className="eqv-ed-btn" disabled={saving} onClick={() => edit({ kind: 'ignore', alias: selected.alias })}>무시 (I)</button>
              </div>
            </>
          ) : <p>왼쪽에서 alias를 선택하세요.</p>}
        </div>
      </div>
      {palette && (
        <div
          ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${ids}-palette-title`} className="eqv-ed-palette"
          onKeyDown={onDialogKeyDown}
        >
          <h3 id={`${ids}-palette-title`}>{palette.alias}를 배정할 component</h3>
          <input
            ref={filterRef} type="text" role="combobox" aria-label="component 필터" aria-expanded="true" aria-autocomplete="list"
            aria-controls={`${ids}-palette-list`} value={palette.filter}
            aria-activedescendant={options.length ? paletteOptionId(options[Math.min(palette.active, options.length - 1)]!.id) : undefined}
            onChange={(event) => setPalette({ ...palette, filter: event.target.value, active: 0 })}
          />
          <div id={`${ids}-palette-list`} role="listbox" aria-label="component 목록" className="eqv-ed-palette-list">
            {options.map((option, index) => (
              <div
                key={option.id} id={paletteOptionId(option.id)} role="option" aria-selected={index === Math.min(palette.active, options.length - 1)}
                className={index === Math.min(palette.active, options.length - 1) ? 'eqv-ed-selected' : undefined}
                onClick={() => assignFromPalette(option.id)}
              >
                <code>{option.id}</code> {option.label} <span className="eqv-ed-badge">{option.role}</span>
              </div>
            ))}
            {options.length === 0 && <p>일치하는 component가 없습니다.</p>}
          </div>
          <button type="button" className="eqv-ed-btn" onClick={closePalette}>닫기</button>
        </div>
      )}
    </section>
  );
}
