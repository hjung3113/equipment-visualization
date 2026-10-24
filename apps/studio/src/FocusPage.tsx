import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Inbox, MapPinOff, ServerCrash } from 'lucide-react';
import type { ReplayInput } from '@eqv/core';
import type { PlaybackScheduler } from '@eqv/replay';
import { FocusView, type FocusTab } from '@eqv/views';
import { loadFocus, type FocusLoad } from './focus-data.js';
import { Button } from '@ap/ui';
import { LoadingBlock, Page, StateMessage } from '@eqv/ui';
import { Link, hrefFor, navigate } from './router.js';
import { windowHex } from './onboarding-data.js';
import { WindowPicker } from './WindowPicker.js';

const PICKER_HINT = '재생·Gantt·목록이 이 window 하나를 씁니다. 기본은 진입 Occurrence를 담은 가장 늦은 window, 없으면 가장 늦은 window이며, 고른 window는 주소(?window=)에 남습니다.';

export function FocusPage({ equipmentId, sampleWindow, entityType, anchor, scheduler, timelineBudget, ganttSpanLimit }: {
  equipmentId: string; sampleWindow: string | null; entityType: string | null; anchor: string | null;
  /** Largest `timelineCost` the Gantt is computed for; tests only, `FocusView`'s default otherwise. */
  timelineBudget?: number;
  /** Most Gantt spans (materials + activities + markers) drawn; tests only, `FocusView`'s default otherwise. */
  ganttSpanLimit?: number;
  /** Frame clock for playback; tests only, the browser's by default. */
  scheduler?: PlaybackScheduler;
}) {
  // The anchor only picks the window when `?window=` is absent, so it is part of the load only then.
  const loadKey = JSON.stringify([equipmentId, sampleWindow, sampleWindow === null ? anchor : null]);
  const [loaded, setLoaded] = useState<{ loadKey: string; result: FocusLoad | null }>({ loadKey, result: null });
  // A late result of a previous load is dropped by the effect cleanup; a changed load key clears the result during render.
  if (loaded.loadKey !== loadKey) setLoaded({ loadKey, result: null });

  useEffect(() => {
    let cancelled = false;
    loadFocus(equipmentId, { ...(sampleWindow === null ? {} : { window: sampleWindow }), anchor }).then((result) => {
      if (!cancelled) setLoaded((previous) => previous.loadKey === loadKey ? { ...previous, result } : previous);
    });
    return () => { cancelled = true; };
  }, [loadKey]);

  // The detail tab belongs to the page, not to a load: FocusView unmounts while a load runs, and the tab must outlive it.
  const [tab, setTab] = useState<FocusTab>('list');
  const { result } = loaded;
  const ok = result?.kind === 'ok' ? result : null;
  const input = useMemo((): ReplayInput | null => ok ? { batch: ok.batch, layouts: ok.layouts, layoutRevisions: ok.layoutRevisions, bindings: ok.bindings, mappings: ok.mappings } : null, [ok]);

  return (
    <Page title={<>Focus · <code>{equipmentId}</code></>}
      description={anchor !== null ? <span title={`${entityType ?? '—'} / ${anchor}`}>진입 키: <code>{entityType ?? '—'}</code> / <code>{anchor}</code></span> : '진입 키 없음'}
      breadcrumb={{ label: '경로', items: [
        { key: 'fleet', label: 'Fleet', href: hrefFor({ name: 'fleet' }) },
        { key: 'equipment', label: equipmentId, href: hrefFor({ name: 'equipment', equipmentId }) },
      ] }} linkComponent={Link}
      actions={result?.kind === 'ok' ? (
        <Button asChild variant="secondary" size="toolbar">
          <Link href={hrefFor({ name: 'onboarding', equipmentId, window: sampleWindow ?? windowHex(result.selectedWindow) })}>
            <ArrowRight className="size-3.5" aria-hidden />Onboarding으로 이동
          </Link>
        </Button>
      ) : result?.kind === 'not-found' || result?.kind === 'error' ? (
        <Button asChild variant="secondary" size="toolbar">
          <Link href={hrefFor({ name: 'fleet' })}><ArrowRight className="size-3.5" aria-hidden />Fleet으로 이동</Link>
        </Button>
      ) : undefined}>
      <WindowPicker equipmentId={equipmentId} hint={PICKER_HINT}
        value={sampleWindow ?? (ok ? windowHex(ok.selectedWindow) : null)}
        details={ok ? { dataGeneration: ok.batch.dataGeneration, timeDomain: ok.batch.timeDomain, hash: ok.selectedWindow.hash } : null}
        onChange={(hex) => navigate(hrefFor({ name: 'focus', equipmentId, entityType, anchor, window: hex }))} />
      {result === null ? <LoadingBlock label="불러오는 중…" /> : result.kind === 'not-found' ? (
        <StateMessage icon={MapPinOff} title="설비를 찾을 수 없습니다" body="등록된 설비 기록이 없습니다." />
      ) : result.kind === 'no-observations' ? (
        <StateMessage icon={Inbox} title="Sample Window를 가져오세요"
          body="이 설비는 등록되었지만 아직 가져온 관측이 없습니다. 재생할 Sample Window가 없습니다."
          action={<Button asChild variant="secondary" size="sm"><Link href={hrefFor({ name: 'equipment', equipmentId })}>설비 데이터 열기</Link></Button>} />
      ) : result.kind === 'error' ? (
        <StateMessage tone="danger" icon={ServerCrash} title="데이터 오류" body={result.error} />
      ) : (
        <FocusView input={input!} notices={result.notices} entityType={entityType} anchor={anchor} resetKey={loadKey} tab={tab} onTabChange={setTab}
          {...(timelineBudget === undefined ? {} : { timelineBudget })} {...(ganttSpanLimit === undefined ? {} : { ganttSpanLimit })} scheduler={scheduler}
          links={{ journey: (occurrenceId) => (
            <Button asChild variant="secondary" size="toolbar">
              <Link href={hrefFor({ name: 'journey', equipmentId, anchor: occurrenceId, window: sampleWindow ?? windowHex(result.selectedWindow) })}>Journey 열기</Link>
            </Button>
          ) }} />
      )}
    </Page>
  );
}
