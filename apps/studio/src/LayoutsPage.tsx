import { Component, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { validateLayout, type LayoutDocument } from '@eqv/core';
import { TopViewer } from '@eqv/renderer';
import { ApiError, listDir, publishRevision, readFile, saveDraft } from './api.js';
import { Link, hrefFor, navigate } from './router.js';

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 600;
const REVISION_FILE = /^([0-9a-f]{64})\.layout\.json$/;

interface Doc {
  /** The value exactly as read from a file or import; this is what save and publish write. */
  raw: unknown;
  layout: LayoutDocument;
}
type Loaded = { state: 'loading' } | { state: 'error'; message: string } | ({ state: 'ready' } & Doc);
interface LayoutEntry {
  id: string;
  files: { path: string; label: string }[];
}
interface Listing {
  templates: { path: string; label: string }[];
  layouts: LayoutEntry[];
}

const message = (error: unknown) => error instanceof Error ? error.message : '알 수 없는 오류';

class ViewerBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: message(error) };
  }

  render() {
    return this.state.error !== null
      ? <p role="alert">이 레이아웃을 그릴 수 없습니다: {this.state.error}</p>
      : this.props.children;
  }
}

function parseDoc(raw: unknown): { doc: Doc } | { issues: string } {
  const result = validateLayout(raw);
  if (result.ok) return { doc: { raw, layout: result.layout } };
  return { issues: result.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n') };
}

async function dirOrEmpty(dir: string) {
  try {
    return await listDir(dir);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return [];
    throw error;
  }
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

export function LayoutsPage({ file }: { file: string | null }) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [listingError, setListingError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(file === null ? null : { state: 'loading' });
  const [imported, setImported] = useState<Doc | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [revision, setRevision] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [prevFile, setPrevFile] = useState(file);
  const [documentEpoch, setDocumentEpoch] = useState(0);
  const activeDocumentEpoch = useRef<number | null>(documentEpoch);

  const [importSequence, setImportSequence] = useState(0);
  const activeImportSequence = useRef<number | null>(importSequence);

  useLayoutEffect(() => {
    activeImportSequence.current = importSequence;
    return () => { activeImportSequence.current = null; };
  }, [importSequence]);

  useLayoutEffect(() => {
    activeDocumentEpoch.current = documentEpoch;
    return () => { activeDocumentEpoch.current = null; };
  }, [documentEpoch]);

  // Opening another file discards an unsaved import and any notices tied to the previous document.
  if (prevFile !== file) {
    setPrevFile(file);
    setDocumentEpoch(documentEpoch + 1);
    setImportSequence(importSequence + 1);
    setBusy(false);
    setImported(null);
    setActionError(null);
    setRevision(null);
    setLoaded(file === null ? null : { state: 'loading' });
  }

  useEffect(() => {
    let cancelled = false;
    loadListing().then(
      (next) => { if (!cancelled) { setListing(next); setListingError(null); } },
      (error: unknown) => { if (!cancelled) setListingError(message(error)); },
    );
    return () => { cancelled = true; };
  }, [reload]);

  useEffect(() => {
    if (file === null) return;
    let cancelled = false;
    readFile(file).then(
      (raw) => {
        if (cancelled) return;
        const parsed = parseDoc(raw);
        setLoaded('doc' in parsed ? { state: 'ready', ...parsed.doc } : { state: 'error', message: parsed.issues });
      },
      (error: unknown) => { if (!cancelled) setLoaded({ state: 'error', message: message(error) }); },
    );
    return () => { cancelled = true; };
  }, [file, reload]);

  const current: Doc | null = imported ?? (loaded?.state === 'ready' ? loaded : null);

  async function onImport(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const picked = input.files?.[0];
    if (!picked) return;
    const sequence = (activeImportSequence.current ?? importSequence) + 1;
    activeImportSequence.current = sequence;
    setImportSequence(sequence);
    input.value = '';
    try {
      const raw: unknown = JSON.parse(await picked.text());
      if (activeImportSequence.current !== sequence) return;
      const parsed = parseDoc(raw);
      if ('doc' in parsed) {
        const epoch = (activeDocumentEpoch.current ?? documentEpoch) + 1;
        activeDocumentEpoch.current = epoch;
        setDocumentEpoch(epoch);
        setBusy(false);
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
    setImported(null);
    setReload((count) => count + 1);
    navigate(hrefFor({ name: 'layouts', file: path }));
  });

  const onPublish = () => current && run(async (isActive) => {
    const result = await publishRevision(current.raw);
    if (!isActive()) return;
    setRevision(result.revision);
    setReload((count) => count + 1);
  });

  const item = (entry: { path: string; label: string }) => (
    <li key={entry.path}>
      <Link href={hrefFor({ name: 'layouts', file: entry.path })} aria-current={entry.path === file ? 'page' : undefined}>
        {entry.label}
      </Link>
    </li>
  );

  return (
    <>
      <h1>레이아웃</h1>
      <section aria-label="레이아웃 목록">
        {listingError !== null && <p role="alert">{listingError}</p>}
        {listing === null && listingError === null && <p>목록을 불러오는 중…</p>}
        {listing && (
          <>
            <h2>템플릿 (읽기 전용)</h2>
            <ul>{listing.templates.map(item)}</ul>
            <h2>레이아웃</h2>
            {listing.layouts.length === 0 && <p>저장된 레이아웃이 없습니다.</p>}
            {listing.layouts.map((entry) => (
              <div key={entry.id}>
                <h3>{entry.id}</h3>
                <ul>{entry.files.map(item)}</ul>
              </div>
            ))}
          </>
        )}
      </section>
      <section aria-label="문서">
        <div>
          <label>
            가져오기 <input type="file" accept=".json,application/json" onChange={onImport} />
          </label>{' '}
          <button type="button" onClick={onExport} disabled={!current}>내보내기</button>{' '}
          <button type="button" onClick={onSaveDraft} disabled={!current || busy}>초안 저장</button>{' '}
          <button type="button" onClick={onPublish} disabled={!current || busy}>Revision 게시</button>
        </div>
        {actionError !== null && <p role="alert">{actionError}</p>}
        {revision !== null && <p role="status">게시된 Revision: <code>{revision}</code></p>}
        {loaded?.state === 'loading' && !imported && <p>문서를 불러오는 중…</p>}
        {loaded?.state === 'error' && !imported && <p role="alert">{loaded.message}</p>}
        {!current && loaded === null && <p>목록에서 파일을 선택하거나 JSON 파일을 가져오세요.</p>}
        {current && (
          <>
            <p>
              <code>{current.layout.id}</code>
              {imported && <> <strong>저장 안 됨</strong></>}
            </p>
            <ViewerBoundary key={documentEpoch}>
              <TopViewer layout={current.layout} width={VIEW_WIDTH} height={VIEW_HEIGHT} />
            </ViewerBoundary>
          </>
        )}
      </section>
    </>
  );
}
