import { useEffect, useState } from 'react';
import { FolderGit2, Library, TriangleAlert } from 'lucide-react';
import { StateMessage } from '@eqv/ui';
import { importStatus, type ImportStatus } from './api.js';
import { errorMessage } from './error-message.js';

export type ImportStatusState = { kind: 'loading' } | { kind: 'ok'; status: ImportStatus } | { kind: 'error'; message: string };

/** Reads `/api/import/status` once per mount. A failed read is its own state: import counts as unavailable. */
export function useImportStatus(): ImportStatusState {
  const [state, setState] = useState<ImportStatusState>({ kind: 'loading' });
  useEffect(() => {
    let cancelled = false;
    importStatus().then(
      (status) => { if (!cancelled) setState({ kind: 'ok', status }); },
      (error: unknown) => { if (!cancelled) setState({ kind: 'error', message: errorMessage(error) }); },
    );
    return () => { cancelled = true; };
  }, []);
  return state;
}

/** True unless the status loaded and import is enabled; a disabled entry points at `ImportStatusNotices`' `disabledId`. */
export const importBlocked = (state: ImportStatusState): boolean => state.kind !== 'ok' || !state.status.enabled;

export function ImportStatusNotices({ state, git = false, catalog = false, disabledId }: {
  state: ImportStatusState;
  /** Also warn when the data root sits inside a git work tree. */
  git?: boolean;
  /** Also say when the bundled Template catalog is used. */
  catalog?: boolean;
  /** Id of the wrapper around the "unavailable" notices, for a disabled button's `aria-describedby`. */
  disabledId?: string;
}) {
  const unavailable = state.kind === 'error' ? (
    <StateMessage compact tone="warning" icon={TriangleAlert} title="가져오기 상태를 확인할 수 없습니다" body={state.message} />
  ) : state.kind === 'ok' && !state.status.enabled ? (
    <StateMessage compact tone="warning" icon={TriangleAlert} title="가져오기를 쓸 수 없습니다"
      body={<>사유: {state.status.reason}<br />설비 기록과 Sample Window는 이 저장소 밖 데이터 루트에만 씁니다(ADR-0010). 데이터 루트를 바꾸려면 EQV_STUDIO_ASSETS를 지정하고 dev 서버를 다시 시작하세요.</>} />
  ) : null;
  const ok = state.kind === 'ok' && state.status.enabled ? state.status : null;
  const notices = [
    unavailable === null ? null : disabledId === undefined ? <div key="unavailable">{unavailable}</div> : <div key="unavailable" id={disabledId}>{unavailable}</div>,
    git && ok?.insideGitWorkTree ? (
      <StateMessage key="git" compact tone="warning" icon={FolderGit2} title="데이터 루트가 git 작업 트리 안에 있습니다"
        body="가져온 파일이 그 저장소에 커밋될 수 있습니다. 공개 저장소라면 커밋하지 마세요." />
    ) : null,
    catalog && state.kind === 'ok' && state.status.catalog === 'bundled' ? (
      <StateMessage key="catalog" compact icon={Library} title="번들 Template 카탈로그를 씁니다"
        body="데이터 루트에 templates/ 폴더가 없어 Studio에 들어 있는 Template(assets/templates/)으로 제안합니다." />
    ) : null,
  ].filter((notice) => notice !== null);
  return notices.length === 0 ? null : <div className="grid gap-2">{notices}</div>;
}
