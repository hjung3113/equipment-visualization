import { useEffect, useRef, useState } from 'react';
import { CircleCheck, Info, Send, ServerCrash, TriangleAlert } from 'lucide-react';
import type { LayoutDocument } from '@eqv/core';
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  Button,
} from '@fops/ui';
import { DataTable, DetailFields, LoadingBlock, StateMessage, type DetailField } from '@eqv/ui';
import { publishBaseline, type PublishBaseline } from './layout-baseline.js';
import { COLLECTIONS, isUnchanged, type LayoutChanges } from './layout-changes.js';
import { errorMessage } from './error-message.js';

type Preview = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; baseline: PublishBaseline };

const CHANGE_LABEL = { added: '추가', removed: '삭제', changed: '변경' } as const;

function changeRows(changes: LayoutChanges) {
  return [
    ...changes.header.map((name) => ({ item: '머리 필드', id: name, change: CHANGE_LABEL.changed })),
    ...COLLECTIONS.flatMap((name) => (['added', 'removed', 'changed'] as const).flatMap((kind) =>
      changes.collections[name][kind].map((id) => ({ item: name, id, change: CHANGE_LABEL[kind] })))),
  ];
}

function Changes({ changes }: { changes: LayoutChanges }) {
  const rows = changeRows(changes);
  if (isUnchanged(changes)) return <StateMessage compact icon={CircleCheck} title="변경 없음" />;
  return (
    <>
      <DetailFields items={[
        { key: 'header', label: '머리 필드', value: changes.header.length > 0 ? changes.header.join(', ') : '변경 없음' },
        ...COLLECTIONS.map((name): DetailField => {
          const { added, removed, changed } = changes.collections[name];
          return { key: name, label: name, value: `추가 ${added.length} · 삭제 ${removed.length} · 변경 ${changed.length}` };
        }),
      ]} />
      <DataTable label="Layout 변경 목록" columns={['항목', 'ID', '변경']} capped>
        {rows.map((row) => (
          <DataTable.Row key={`${row.item}/${row.id}/${row.change}`}>
            <DataTable.Cell>{row.item}</DataTable.Cell>
            <DataTable.Cell mono>{row.id}</DataTable.Cell>
            <DataTable.Cell>{row.change}</DataTable.Cell>
          </DataTable.Row>
        ))}
      </DataTable>
    </>
  );
}

function Summary({ baseline, layout }: { baseline: PublishBaseline; layout: LayoutDocument }) {
  const skipped = 'skipped' in baseline && baseline.skipped.length > 0
    ? <StateMessage compact tone="warning" icon={TriangleAlert} title={`읽을 수 없어 건너뛴 Binding 파일: ${baseline.skipped.join(', ')}`} /> : null;
  switch (baseline.kind) {
    case 'identical':
      return <StateMessage compact icon={Info} title={`이 내용은 이미 ${baseline.hex.slice(0, 12)}로 게시되어 있습니다`} body="게시해도 새 파일이 만들어지지 않습니다." />;
    case 'first':
      return <>
        <StateMessage compact icon={Info} title="첫 Revision" />
        <DetailFields items={[
          { key: 'components', label: 'components', value: layout.components.length },
          { key: 'physicalInterfaces', label: 'physicalInterfaces', value: layout.physicalInterfaces.length },
          { key: 'transferCapabilities', label: 'transferCapabilities', value: layout.transferCapabilities.length },
        ]} />
        {skipped}
      </>;
    case 'unpinned':
      return <>
        <StateMessage compact tone="warning" icon={TriangleAlert} title={`기존 Revision ${baseline.count}개`}
          body="이 Layout의 Revision을 가리키는 Binding이 없어 비교 기준이 없습니다." />
        {skipped}
      </>;
    case 'compared':
      return <>
        <p className="m-0 text-sm">
          비교 기준: <code className="font-mono">{baseline.hex.slice(0, 12)}</code>{baseline.pinned ? ' · Binding이 가리키는 Revision' : ''}
        </p>
        <Changes changes={baseline.changes} />
        {skipped}
      </>;
  }
}

/** Confirm step of the Layout Revision publish: shows what the click writes, then `onPublish` with the previewed document. */
export function PublishDialog({ layout, onPublish, onCancel }: {
  layout: LayoutDocument;
  onPublish(): void;
  onCancel(): void;
}) {
  const [preview, setPreview] = useState<Preview>({ state: 'loading' });
  const cancelRef = useRef<HTMLButtonElement>(null);

  // The dialog is mounted for one session; closing it, or an epoch change that unmounts it, drops a late result.
  useEffect(() => {
    let live = true;
    publishBaseline(layout).then(
      (baseline) => { if (live) setPreview({ state: 'ready', baseline }); },
      (error: unknown) => { if (live) setPreview({ state: 'error', message: errorMessage(error) }); },
    );
    return () => { live = false; };
  }, [layout]);

  return (
    <AlertDialog open onOpenChange={(next) => { if (!next) onCancel(); }}>
      <AlertDialogContent role="alertdialog" onOpenAutoFocus={(event) => { event.preventDefault(); cancelRef.current?.focus(); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>Layout Revision을 게시할까요?</AlertDialogTitle>
          <AlertDialogDescription>
            Layout <code className="font-mono">{layout.id}</code>의 변경을 확인한 뒤 게시합니다. 게시한 Revision은 바꿀 수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          {preview.state === 'loading' && <LoadingBlock label="비교 기준을 확인하는 중…" />}
          {preview.state === 'error' && <StateMessage compact tone="danger" icon={ServerCrash} title={preview.message} />}
          {preview.state === 'ready' && <Summary baseline={preview.baseline} layout={layout} />}
        </div>
        <AlertDialogFooter>
          <Button ref={cancelRef} type="button" variant="secondary" size="sm" onClick={onCancel}>취소</Button>
          <Button type="button" variant="primary" size="sm" disabled={preview.state === 'loading'} onClick={onPublish}>
            <Send className="size-3.5" aria-hidden />게시
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
