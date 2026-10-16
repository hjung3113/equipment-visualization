import { useEffect, useState } from 'react';
import { FleetTable, InventoryView, summarizeFleet, TemplateProposals, type FleetRow } from '@eqv/editor';
import { listEquipmentIds, loadEquipment, loadOnboarding, type OnboardingLoad } from './onboarding-data.js';
import { Link, hrefFor } from './router.js';

const message = (error: unknown) => error instanceof Error ? error.message : '알 수 없는 오류';

type FleetState = { rows: FleetRow[] } | { error: string } | null;

export function FleetPage() {
  const [state, setState] = useState<FleetState>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = await listEquipmentIds();
      const loads = await Promise.all(ids.map(loadEquipment));
      return summarizeFleet(loads.map((load, i) => {
        const equipmentId = ids[i]!;
        if (load.kind === 'ok') return load.data;
        const error = load.kind === 'not-found' ? '설비 기록을 읽을 수 없습니다' : load.error;
        return { equipmentId, maker: load.kind === 'error' ? load.record?.maker ?? null : null,
          model: load.kind === 'error' ? load.record?.model ?? null : null, error };
      }));
    })().then(
      (rows) => { if (!cancelled) setState({ rows }); },
      (error: unknown) => { if (!cancelled) setState({ error: message(error) }); },
    );
    return () => { cancelled = true; };
  }, []);
  return (
    <>
      <h1>Fleet</h1>
      {state === null ? <p>불러오는 중…</p> : 'error' in state ? <p role="alert">설비 목록을 불러오지 못했습니다: {state.error}</p> : (
        state.rows.length === 0 ? <p>등록된 설비가 없습니다.</p> : (
          <FleetTable rows={state.rows}
            renderLink={(equipmentId, children) => <Link href={hrefFor({ name: 'onboarding', equipmentId })}>{children}</Link>} />
        )
      )}
    </>
  );
}

export function OnboardingPage({ equipmentId }: { equipmentId: string }) {
  // The loaded state belongs to the route's equipmentId: a change clears it during render, and a late result of
  // a previous id is dropped by the effect cleanup.
  const [loaded, setLoaded] = useState<{ equipmentId: string; result: OnboardingLoad | null }>({ equipmentId, result: null });
  if (loaded.equipmentId !== equipmentId) setLoaded({ equipmentId, result: null });

  useEffect(() => {
    let cancelled = false;
    loadOnboarding(equipmentId).then((result) => { if (!cancelled) setLoaded({ equipmentId, result }); });
    return () => { cancelled = true; };
  }, [equipmentId]);

  const { result } = loaded;
  return (
    <>
      <h1>Onboarding <code>{equipmentId}</code></h1>
      {result === null ? <p>불러오는 중…</p> : result.kind === 'not-found' ? (
        <>
          <p>설비를 찾을 수 없습니다</p>
          <p><Link href={hrefFor({ name: 'fleet' })}>Fleet으로 이동</Link></p>
        </>
      ) : result.kind === 'error' ? (
        <>
          <p role="alert">데이터 오류: {result.error}</p>
          <p><Link href={hrefFor({ name: 'fleet' })}>Fleet으로 이동</Link></p>
        </>
      ) : (
        <>
          <p>{result.data.record.maker} / {result.data.record.model}</p>
          {result.skippedTemplates.length > 0 && <p role="status">건너뛴 Template: {result.skippedTemplates.join(', ')}</p>}
          <InventoryView inventory={result.data.inventory} dictionaries={result.data.dictionaries} />
          <TemplateProposals inventory={result.data.inventory} dictionaries={result.data.dictionaries} templates={result.templates} />
        </>
      )}
    </>
  );
}
