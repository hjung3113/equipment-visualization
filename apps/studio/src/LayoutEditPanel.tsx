import { useState } from 'react';
import { Redo2, RotateCcw, RotateCw, Undo2 } from 'lucide-react';
import type { Component } from '@eqv/core';
import { DetailFields, FormField } from '@eqv/ui';
import { Button, Checkbox, EmptyState, Input, Label, PanelSectionTitle } from '@fops/ui';

const TOOL_ICON = 'size-3.5';

export interface EditToolbarProps {
  busy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  snap: boolean;
  onUndo(): void;
  onRedo(): void;
  onRotate(degrees: number): void;
  onSnapChange(snap: boolean): void;
}

export function EditToolbar({ busy, canUndo, canRedo, hasSelection, snap, onUndo, onRedo, onRotate, onSnapChange }: EditToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="secondary" size="toolbar" disabled={busy || !canUndo} aria-keyshortcuts="Control+Z Meta+Z" onClick={onUndo}>
        <Undo2 className={TOOL_ICON} aria-hidden />실행 취소
      </Button>
      <Button type="button" variant="secondary" size="toolbar" disabled={busy || !canRedo} aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y" onClick={onRedo}>
        <Redo2 className={TOOL_ICON} aria-hidden />다시 실행
      </Button>
      <Button type="button" variant="secondary" size="toolbar" disabled={busy || !hasSelection} aria-keyshortcuts="[" onClick={() => onRotate(-15)}>
        <RotateCcw className={TOOL_ICON} aria-hidden />왼쪽으로 15° 회전
      </Button>
      <Button type="button" variant="secondary" size="toolbar" disabled={busy || !hasSelection} aria-keyshortcuts="]" onClick={() => onRotate(15)}>
        <RotateCw className={TOOL_ICON} aria-hidden />오른쪽으로 15° 회전
      </Button>
      <Checkbox id="layout-edit-snap" checked={snap} disabled={busy} onCheckedChange={(value) => onSnapChange(value === true)} />
      <Label htmlFor="layout-edit-snap">격자 맞춤</Label>
      <span className="text-xs text-text-muted">Alt+화살표 이동 · Shift와 함께 10배 · [ ] 15° 회전</span>
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  hint?: string;
  disabled: boolean;
  onCommit(value: number): void;
}

/** Text input for one number. Enter or blur commits, Escape restores; a non-number shows an error and commits nothing. */
function NumberField({ label, value, hint, disabled, onCommit }: NumberFieldProps) {
  const [text, setText] = useState(String(value));
  const [shown, setShown] = useState(value);
  const [error, setError] = useState<string | null>(null);
  if (shown !== value) {
    setShown(value);
    setText(String(value));
    setError(null);
  }
  const restore = () => { setText(String(value)); setError(null); };
  const commit = () => {
    const parsed = text.trim() === '' ? Number.NaN : Number(text);
    if (!Number.isFinite(parsed)) { setError('숫자를 입력하세요'); return; }
    setError(null);
    onCommit(parsed);
    setText(String(value));
  };
  return (
    <FormField label={label} hint={hint} error={error}>
      {(control) => (
        <Input {...control} type="text" inputMode="decimal" autoComplete="off" spellCheck={false} value={text} disabled={disabled}
          onChange={(event) => { setText(event.target.value); setError(null); }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); commit(); }
            else if (event.key === 'Escape') { event.preventDefault(); restore(); }
          }} />
      )}
    </FormField>
  );
}

export interface SelectionPanelProps {
  component: Component | undefined;
  busy: boolean;
  onTransform(patch: { x?: number; y?: number; rotation?: number }): void;
}

export function SelectionPanel({ component, busy, onTransform }: SelectionPanelProps) {
  return (
    <section aria-label="선택 항목" className="space-y-3">
      <PanelSectionTitle>선택 항목</PanelSectionTitle>
      {component === undefined ? (
        <EmptyState size="sm" title="Top View에서 Component를 선택하세요." />
      ) : (
        <>
          <DetailFields items={[
            { key: 'id', label: 'ID', value: component.id, mono: true },
            { key: 'label', label: '이름', value: component.label },
            { key: 'role', label: 'Role', value: component.role },
            { key: 'parent', label: '부모', value: component.parentId ?? '없음' },
          ]} />
          <div className="grid gap-3 sm:grid-cols-3">
            {/* A new Component remounts the fields so no half-typed text carries over. */}
            <NumberField key={`${component.id}-x`} label="X" value={component.transform.x} disabled={busy}
              hint={component.parentId === undefined ? undefined : '부모 Component 기준 좌표'} onCommit={(x) => onTransform({ x })} />
            <NumberField key={`${component.id}-y`} label="Y" value={component.transform.y} disabled={busy}
              hint={component.parentId === undefined ? undefined : '부모 Component 기준 좌표'} onCommit={(y) => onTransform({ y })} />
            <NumberField key={`${component.id}-rotation`} label="회전 (°)" value={component.transform.rotation} disabled={busy}
              onCommit={(rotation) => onTransform({ rotation })} />
          </div>
        </>
      )}
    </section>
  );
}
