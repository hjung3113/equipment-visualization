import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { CircleCheck, Download, FileJson, Save, Send, ServerCrash } from 'lucide-react';
import { validateLayout, type LayoutDocument } from '@eqv/core';
import { PRIMITIVE_CATALOG, TopViewer, type ComponentDrag } from '@eqv/renderer';
import {
  addPhysicalInterface, removePhysicalInterface, removePort, addHoldingSite, removeHoldingSite, addTransferCapability, removeTransferCapability,
  addComponent, removalImpact, removeComponent, setLabel, DEFAULT_SNAP, canRedo, canUndo, cancelDrag, createLayoutEdit, dragTo, endDrag, isDirty, markSaved, moveBy, redo, rotateBy, setTransform, undo,
  type LayoutEditState,
} from '@eqv/editor';
import { dirOrEmpty, publishRevision, readFile, saveDraft } from './api.js';
import { AddComponentRow, EditToolbar, ROTATE_STEP, SelectionPanel } from './LayoutEditPanel.js';
import { ConnectionsPanel } from './LayoutConnections.js';
import { REVISION_FILE } from './layout-baseline.js';
import { newComponentSize } from './new-component-size.js';
import { PublishDialog } from './PublishDialog.js';
import { FileButton, LoadingBlock, Page, Panel, StateMessage, StatusBadge, ViewerZoomControls } from '@eqv/ui';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogHeader, AlertDialogFooter, Button, EmptyState, PanelSectionTitle, cn } from '@fops/ui';
import { Link, hrefFor, navigate, setNavigationBlocker } from './router.js';

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 600;
/** Width used until the document column has been measured (and where ResizeObserver is missing). */
const FALLBACK_WIDTH = 640;

interface Doc {
  /** The value exactly as read from a file or import; this is what save and publish write. */
  raw: unknown;
  layout: LayoutDocument;
}
type Loaded = { state: 'loading' } | { state: 'error'; message: string } | ({ state: 'ready' } & Doc);
/** The edit history of one open document; `source` is the `Doc.raw` it started from. */
interface EditSession {
  source: unknown;
  state: LayoutEditState;
}
interface LayoutEntry {
  id: string;
  files: { path: string; label: string }[];
}
interface Listing {
  templates: { path: string; label: string }[];
  layouts: LayoutEntry[];
}

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

const message = (error: unknown) => error instanceof Error ? error.message : '알 수 없는 오류';

class ViewerBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: message(error) };
  }

  render() {
    return this.state.error !== null
      ? <StateMessage compact tone="danger" icon={ServerCrash} title={`이 레이아웃을 그릴 수 없습니다: ${this.state.error}`} />
      : this.props.children;
  }
}

function parseDoc(raw: unknown): { doc: Doc } | { issues: string } {
  const result = validateLayout(raw);
  if (result.ok) return { doc: { raw, layout: result.layout } };
  return { issues: result.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n') };
}

async function loadListing(): Promise<Listing> {
  const templates = (await dirOrEmpty('templates')).filter((entry) => entry.kind === 'file')
    .map((entry) => ({ path: `templates/${entry.name}`, label: entry.name.replace(/\.template\.json$/, '') }));
  const folders = (await dirOrEmpty('layouts')).filter((entry) => entry.kind === 'dir');
  const layouts = await Promise.all(folders.map(async ({ name }) => {
    const files = (await dirOrEmpty(`layouts/${name}`)).flatMap((entry) => {
      const path = `layouts/${name}/${entry.name}`;
      if (entry.name === 'draft.layout.json') return [{ path, label: 'draft' }];
      const revision = REVISION_FILE.exec(entry.name);
      return revision ? [{ path, label: revision[1]!.slice(0, 12) }] : [];
    });
    return { id: name, files };
  }));
  return { templates, layouts };
}

/** Width of the element behind `ref`, so the viewer fits its column and the zoom controls stay in view. */
function useColumnWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    // Content box: clientWidth includes the card padding, which would push the viewer past the card border.
    const measure = () => {
      const style = getComputedStyle(element);
      const inner = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      if (inner > 0) setWidth(Math.min(VIEW_WIDTH, Math.floor(inner)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export function LayoutsPage({ file }: { file: string | null }) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [listingError, setListingError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(file === null ? null : { state: 'loading' });
  const [imported, setImported] = useState<Doc | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [revision, setRevision] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The document the open publish dialog previews; `onPublish` writes exactly this. */
  const [publishing, setPublishing] = useState<Doc | null>(null);
  const [listingReload, setListingReload] = useState(0);
  const [fileReload, setFileReload] = useState(0);
  const [seed, setSeed] = useState<{ file: string; doc: Doc } | null>(null);
  const [prevFile, setPrevFile] = useState(file);
  const [session, setSession] = useState<EditSession | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletion, setDeletion] = useState<{ id: string; epoch: number; source: unknown } | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const deleteOpener = useRef<HTMLElement | null>(null);
  const deleteFocus = useRef<{ id: string; epoch: number; source: unknown } | null>(null);
  const deleteCancel = useRef<HTMLButtonElement>(null);
  const [snap, setSnap] = useState(false);
  const [documentEpoch, setDocumentEpoch] = useState(0);
  const activeDocumentEpoch = useRef<number | null>(documentEpoch);

  const [importSequence, setImportSequence] = useState(0);
  const activeImportSequence = useRef<number | null>(importSequence);
  const documentRef = useRef<HTMLDivElement>(null);
  const publishOpener = useRef<HTMLButtonElement>(null);
  /** Document epoch whose publish dialog just closed; the opener regains focus once it is enabled again. */
  const focusOpenerFor = useRef<number | null>(null);
  const viewWidth = useColumnWidth(documentRef);

  useLayoutEffect(() => {
    activeImportSequence.current = importSequence;
    return () => { activeImportSequence.current = null; };
  }, [importSequence]);

  useLayoutEffect(() => {
    activeDocumentEpoch.current = documentEpoch;
    return () => { activeDocumentEpoch.current = null; };
  }, [documentEpoch]);

  // The dialog unmounts as it closes, so focus returns from here rather than from its onCloseAutoFocus.
  useEffect(() => {
    const owner = focusOpenerFor.current;
    if (owner === null || publishing !== null || busy) return;
    focusOpenerFor.current = null;
    // Only while focus is lost: a user who moved focus during a pending publish keeps it.
    const lost = document.activeElement === null || document.activeElement === document.body;
    if (owner === documentEpoch && lost) publishOpener.current?.focus();
  }, [publishing, busy, documentEpoch]);

  // After navigation is approved, opening another file clears the import and previous notices.
  if (prevFile !== file) {
    setPrevFile(file);
    if (seed?.file !== file) setDocumentEpoch(documentEpoch + 1);
    setImportSequence(importSequence + 1);
    setBusy(false);
    setPublishing(null);
    setImported(null);
    setActionError(null);
    setRevision(null);
    setLoaded(seed?.file === file ? { state: 'ready', ...seed.doc } : file === null ? null : { state: 'loading' });
    setSeed(null);
  }

  const base: Doc | null = imported ?? (loaded?.state === 'ready' ? loaded : null);
  // A new document, or a differing read of the open file, starts a new edit session; a save keeps it (its `source` follows).
  // Not while a file switch is pending: `base` still holds the previous file, and a save's seeded navigation keeps its session.
  if (prevFile === file && (session?.source ?? null) !== (base?.raw ?? null)) {
    setSession(base === null ? null : { source: base.raw, state: createLayoutEdit(base.raw as LayoutDocument) });
    setSelectedId(null);
  }
  const edit = session !== null && base !== null && session.source === base.raw ? session.state : null;
  const present = edit?.present ?? null;
  if (deletion && (deletion.epoch !== documentEpoch || deletion.source !== session?.source || prevFile !== file)) setDeletion(null);
  useEffect(() => {
    const pending = deleteFocus.current;
    if (!pending || deletion || busy) return;
    deleteFocus.current = null;
    if (pending.epoch !== documentEpoch || pending.source !== session?.source) return;
    if (present?.components.some((component) => component.id === pending.id)) deleteOpener.current?.focus();
    else (viewerRef.current?.querySelector<HTMLElement>('button:not([disabled]), [tabindex="0"]') ?? viewerRef.current)?.focus();
  }, [deletion, busy, documentEpoch, session?.source, present]);
  const unsavedEdits = edit !== null && isDirty(edit);
  const importPending = imported !== null;

  useLayoutEffect(() => {
    if (!importPending && !unsavedEdits) return;
    setNavigationBlocker(() => window.confirm(importPending
      ? '저장하지 않은 가져오기 문서가 있습니다. 버리고 이동할까요?'
      : '저장하지 않은 편집이 있습니다. 버리고 이동할까요?'));
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      setNavigationBlocker(null);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [importPending, unsavedEdits]);

  useEffect(() => {
    let cancelled = false;
    loadListing().then(
      (next) => { if (!cancelled) { setListing(next); setListingError(null); } },
      (error: unknown) => { if (!cancelled) setListingError(message(error)); },
    );
    return () => { cancelled = true; };
  }, [listingReload]);

  useEffect(() => {
    if (file === null) return;
    let cancelled = false;
    readFile(file).then(
      (raw) => {
        if (cancelled) return;
        const parsed = parseDoc(raw);
        setLoaded((previous) => {
          if (previous?.state === 'ready' && JSON.stringify(previous.raw) === JSON.stringify(raw)) return previous;
          return 'doc' in parsed ? { state: 'ready', ...parsed.doc } : { state: 'error', message: parsed.issues };
        });
      },
      (error: unknown) => { if (!cancelled) setLoaded({ state: 'error', message: message(error) }); },
    );
    return () => { cancelled = true; };
  }, [file, fileReload]);

  /** What the page shows, saves, exports and publishes: the base document with the edits applied. */
  const current: Doc | null = useMemo(() => present === null ? null : { raw: present, layout: present }, [present]);

  async function onImport(picked: File) {
    const sequence = (activeImportSequence.current ?? importSequence) + 1;
    activeImportSequence.current = sequence;
    setImportSequence(sequence);
    try {
      const raw: unknown = JSON.parse(await picked.text());
      if (activeImportSequence.current !== sequence) return;
      const parsed = parseDoc(raw);
      if ('doc' in parsed) {
        const epoch = (activeDocumentEpoch.current ?? documentEpoch) + 1;
        activeDocumentEpoch.current = epoch;
        setDocumentEpoch(epoch);
        setBusy(false);
        setPublishing(null);
        setRevision(null);
        setImported(parsed.doc);
        setActionError(null);
      } else {
        setActionError(`가져오기 실패: ${parsed.issues}`);
      }
    } catch {
      if (activeImportSequence.current === sequence) setActionError('가져오기 실패: JSON을 읽을 수 없습니다');
    }
  }

  function onExport() {
    if (!current) return;
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(current.raw, null, 2)}\n`], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${current.layout.id}.layout.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function run(action: (isActive: () => boolean) => Promise<void>) {
    const owner = activeDocumentEpoch.current;
    const isActive = () => owner !== null && activeDocumentEpoch.current === owner;
    setBusy(true);
    setActionError(null);
    try {
      await action(isActive);
    } catch (error) {
      if (isActive()) setActionError(message(error));
    } finally {
      if (isActive()) setBusy(false);
    }
  }

  const onSaveDraft = () => current && run(async (isActive) => {
    const path = await saveDraft(current.layout.id, current.raw);
    if (!isActive()) return;
    setSession((previous) => previous !== null && previous.state.present === current.raw
      ? { source: current.raw, state: markSaved(previous.state) } : previous);
    setListingReload((count) => count + 1);
    setFileReload((count) => count + 1);
    if (path === file) {
      setLoaded({ state: 'ready', ...current });
      setImported(null);
    } else {
      setSeed({ file: path, doc: current });
      navigate(hrefFor({ name: 'layouts', file: path }), { force: true });
    }
  });

  const onPublish = (doc: Doc) => run(async (isActive) => {
    const result = await publishRevision(doc.raw);
    if (!isActive()) return;
    setRevision(result.revision);
    setListingReload((count) => count + 1);
  });

  const editing = (apply: (state: LayoutEditState) => LayoutEditState) => setSession((previous) => {
    if (previous === null) return previous;
    const state = apply(previous.state);
    return state === previous.state ? previous : { ...previous, state };
  });
  const snapOptions = snap ? DEFAULT_SNAP : null;
  const selected = selectedId === null ? undefined : present?.components.find((component) => component.id === selectedId);
  const editable = !busy && publishing === null && deletion === null;
  const template = present?.kind === 'template';
  const impact = selected && present ? removalImpact(present, selected.id) : null;
  const deleteHint = impact?.blockedBy === 'children' ? '하위 Component를 먼저 삭제하세요.' : impact?.blockedBy === 'last' ? '마지막 Component는 삭제할 수 없습니다.' : null;
  const deletionImpact = deletion && present ? removalImpact(present, deletion.id) : null;
  const deletionCounts = deletionImpact ? [
    deletionImpact.physicalInterfaces && `Physical Interface ${deletionImpact.physicalInterfaces}개`,
    deletionImpact.transferCapabilities && `Transfer Capability ${deletionImpact.transferCapabilities}개`,
    deletionImpact.processRouteSteps && `Process Route 단계 ${deletionImpact.processRouteSteps}개`,
    deletionImpact.processRoutes && `Process Route ${deletionImpact.processRoutes}개`,
  ].filter(Boolean).join(', ') : '';

  function openDeletion(opener: HTMLElement) {
    if (!editable || template || !selected || impact?.blockedBy !== null) return;
    editing(cancelDrag);
    deleteOpener.current = opener;
    setDeletion({ id: selected.id, epoch: documentEpoch, source: session?.source });
  }
  function closeDeletion(confirm: boolean) {
    if (!deletion) return;
    if (deletion.epoch === documentEpoch && deletion.source === session?.source) {
      if (confirm) { editing((state) => removeComponent(state, deletion.id)); setSelectedId(null); }
      deleteFocus.current = deletion;
    }
    setDeletion(null);
  }
  function addSelectedPrimitive(name: string) {
    if (!editable || template || !edit || !present || !session) return;
    const entry = PRIMITIVE_CATALOG.find((candidate) => candidate.name === name);
    const levelId = selected?.levelId ?? [...present.levels].sort((a, b) => a.order - b.order)[0]?.id;
    if (!entry || !levelId) return;
    const { state, componentId } = addComponent(edit, { asset: name, size: newComponentSize(present, name), levelId,
      x: present.viewBox.x + present.viewBox.width / 2, y: present.viewBox.y + present.viewBox.height / 2 }, snapOptions);
    setSession({ ...session, state });
    if (componentId) setSelectedId(componentId);
  }
  // A drag held while the page freezes is settled here; the drag events that follow are ignored.
  useEffect(() => {
    if (!editable) editing(cancelDrag);
  }, [editable]);

  function onComponentDrag({ componentId, phase, dx, dy }: ComponentDrag) {
    if (!editable) return;
    if (phase === 'cancel') editing(cancelDrag);
    else editing((state) => phase === 'end' ? endDrag(dragTo(state, componentId, dx, dy, snapOptions)) : dragTo(state, componentId, dx, dy, snapOptions));
  }

  function rotateSelected(degrees: number) {
    if (selected) editing((state) => rotateBy(state, selected.id, degrees, snapOptions));
  }

  function onViewerKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!selected || !editable || event.defaultPrevented) return;
    if ((event.key === 'Delete' || event.key === 'Backspace') && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      if (!template && impact?.blockedBy === null) { event.preventDefault(); openDeletion(event.target as HTMLElement); }
      return;
    }
    const arrow = ARROWS[event.key];
    if (arrow && event.altKey && !event.ctrlKey && !event.metaKey) {
      const step = (snap ? DEFAULT_SNAP.grid : 1) * (event.shiftKey ? 10 : 1);
      editing((state) => moveBy(state, selected.id, arrow[0] * step, arrow[1] * step, snapOptions));
    } else if ((event.key === '[' || event.key === ']') && !event.altKey && !event.ctrlKey && !event.metaKey) {
      rotateSelected(event.key === '[' ? -ROTATE_STEP : ROTATE_STEP);
    } else return;
    event.preventDefault();
  }

  function onRootKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented || !editable || !(event.metaKey || event.ctrlKey)) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="radio"]')) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) editing(undo);
    else if ((key === 'z' && event.shiftKey) || (key === 'y' && event.ctrlKey)) editing(redo);
    else return;
    event.preventDefault();
  }

  const item = (entry: { path: string; label: string }) => (
    <li key={entry.path}>
      <Link
        href={hrefFor({ name: 'layouts', file: entry.path })} aria-current={entry.path === file ? 'page' : undefined}
        className={cn(
          'block rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-row-hover hover:text-text-primary',
          entry.path === file && 'bg-surface-row-selected font-semibold text-text-primary',
        )}
      >
        {entry.label}
      </Link>
    </li>
  );

  return (
    <Page title="레이아웃">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(200px,260px)_minmax(0,1fr)]" onKeyDown={onRootKeyDown}>
        <Panel title="레이아웃 목록" className="min-w-0">
          <div className="space-y-3">
            {listingError !== null && <StateMessage compact tone="danger" icon={ServerCrash} title={listingError} />}
            {listing === null && listingError === null && <LoadingBlock label="목록을 불러오는 중…" />}
            {listing && (
              <nav aria-label="레이아웃 파일">
                <PanelSectionTitle className="mb-2">템플릿 (읽기 전용)</PanelSectionTitle>
                <ul className="list-none space-y-0.5 p-0">{listing.templates.map(item)}</ul>
                <PanelSectionTitle className="mt-4 mb-2">레이아웃</PanelSectionTitle>
                {listing.layouts.length === 0 && <EmptyState size="sm" icon={<FileJson className="size-4" aria-hidden />} title="저장된 레이아웃이 없습니다." />}
                {listing.layouts.map((entry) => (
                  <div key={entry.id}>
                    <PanelSectionTitle className="mt-2 mb-1">{entry.id}</PanelSectionTitle>
                    <ul className="list-none space-y-0.5 p-0">{entry.files.map(item)}</ul>
                  </div>
                ))}
              </nav>
            )}
          </div>
        </Panel>
        <Panel
          title="문서" className="min-w-0"
          actions={<>
            <FileButton label="가져오기" accept=".json,application/json" onFile={(picked) => { void onImport(picked); }} />
            <Button type="button" variant="secondary" size="toolbar" onClick={onExport} disabled={!current}>
              <Download className="size-3.5" aria-hidden />내보내기
            </Button>
            <Button type="button" variant="secondary" size="toolbar" onClick={onSaveDraft} disabled={!current || !editable}>
              <Save className="size-3.5" aria-hidden />초안 저장
            </Button>
            <Button ref={publishOpener} type="button" variant="primary" size="toolbar" onClick={() => { if (current) setPublishing(current); }} disabled={!current || !editable}>
              <Send className="size-3.5" aria-hidden />Revision 게시
            </Button>
          </>}
        >
          <div ref={documentRef} className="space-y-3">
            {actionError !== null && <StateMessage compact tone="danger" icon={ServerCrash} title={actionError} />}
            {revision !== null && (
              <StateMessage compact icon={CircleCheck} title="게시된 Revision" body={<code className="font-mono">{revision}</code>} />
            )}
            {loaded?.state === 'loading' && !imported && <LoadingBlock label="문서를 불러오는 중…" />}
            {loaded?.state === 'error' && !imported && <StateMessage compact tone="danger" icon={ServerCrash} title={loaded.message} />}
            {!current && loaded === null && (
              <EmptyState size="sm" icon={<FileJson className="size-4" aria-hidden />} title="목록에서 파일을 선택하거나 JSON 파일을 가져오세요." />
            )}
            {current && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-xs">{current.layout.id}</code>
                  {(importPending || unsavedEdits) && <StatusBadge tone="warning">저장 안 됨</StatusBadge>}
                </div>
                {edit && (
                  <EditToolbar busy={!editable} canUndo={canUndo(edit)} canRedo={canRedo(edit)} hasSelection={selected !== undefined} snap={snap}
                    onUndo={() => editing(undo)} onRedo={() => editing(redo)} onRotate={rotateSelected} onSnapChange={setSnap} />
                )}
                <AddComponentRow busy={!editable} template={template} onAdd={addSelectedPrimitive} />
                <div ref={viewerRef} tabIndex={-1} onKeyDown={onViewerKeyDown}>
                  <ViewerBoundary key={documentEpoch}>
                    <TopViewer layout={current.layout} width={viewWidth} height={Math.round(viewWidth * VIEW_HEIGHT / VIEW_WIDTH)}
                      selectedId={selectedId} onSelectedChange={setSelectedId} onComponentDrag={onComponentDrag}
                      renderControls={(controls) => <ViewerZoomControls controls={controls} labels={{ zoomIn: '확대', zoomOut: '축소', fit: '맞춤' }} />} />
                  </ViewerBoundary>
                </div>
                <SelectionPanel component={selected} busy={!editable} deleteDisabled={template || impact?.blockedBy !== null} deleteHint={deleteHint}
                  onDelete={openDeletion} onLabel={(label) => { if (selected && editable) editing((state) => setLabel(state, selected.id, label)); }}
                  onTransform={(patch) => { if (selected) editing((state) => setTransform(state, selected.id, patch)); }} />
                {selected && present && <ConnectionsPanel key={`${documentEpoch}-${selected.id}`} layout={present} component={selected} busy={!editable}
                  onAddPhysicalInterface={(spec) => { if (editable) editing((state) => addPhysicalInterface(state, spec).state); }}
                  onRemovePhysicalInterface={(id) => { if (editable) editing((state) => removePhysicalInterface(state, id)); }}
                  onRemovePort={(id) => { if (editable) editing((state) => removePort(state, selected.id, id)); }}
                  onAddHoldingSite={(kinds) => { if (editable) editing((state) => addHoldingSite(state, selected.id, kinds).state); }}
                  onRemoveHoldingSite={(id) => { if (editable) editing((state) => removeHoldingSite(state, selected.id, id)); }}
                  onAddTransferCapability={(spec) => { if (editable) editing((state) => addTransferCapability(state, spec).state); }}
                  onRemoveTransferCapability={(id) => { if (editable) editing((state) => removeTransferCapability(state, id)); }} />}

              </>
            )}
          </div>
        </Panel>
      </div>
      {deletion && (
        <AlertDialog open onOpenChange={(open) => { if (!open) closeDeletion(false); }}>
          <AlertDialogContent role="alertdialog" onOpenAutoFocus={(event) => { event.preventDefault(); deleteCancel.current?.focus(); }} onCloseAutoFocus={(event) => event.preventDefault()}>
            <AlertDialogHeader>
              <AlertDialogTitle>Component 삭제</AlertDialogTitle>
              <AlertDialogDescription>{deletion.id}을(를) 삭제합니다.{deletionCounts && ` ${deletionCounts}도 함께 삭제됩니다.`}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button ref={deleteCancel} type="button" variant="secondary" size="sm" onClick={() => closeDeletion(false)}>취소</Button>
              <Button type="button" variant="primary" size="sm" onClick={() => closeDeletion(true)}>삭제</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {publishing && (
        <PublishDialog
          layout={publishing.layout}
          onCancel={() => { focusOpenerFor.current = documentEpoch; setPublishing(null); }}
          onPublish={() => { focusOpenerFor.current = documentEpoch; setPublishing(null); void onPublish(publishing); }}
        />
      )}
    </Page>
  );
}
