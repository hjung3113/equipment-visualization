import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { buildGenericLayout, instantiateLayout, type EquipmentLayoutDocument, type TemplateDocument } from '@eqv/core';
import {
  FleetTable, InventoryView, MappingBoard, summarizeFleet, TemplateProposals, type FleetRow, type MappingBoardProps,
} from '@eqv/editor';
import { ApiError, createDraft, saveAliasRules } from './api.js';
import { listEquipmentIds, loadEquipment, loadOnboarding, type DraftLookup, type OnboardingLoad } from './onboarding-data.js';
import { Link, hrefFor, navigate, setNavigationBlocker } from './router.js';

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

type Ok = Extract<OnboardingLoad, { kind: 'ok' }>;
type Choice = Parameters<NonNullable<ComponentProps<typeof TemplateProposals>['action']>>[0];
type CreateState = { pending: boolean; error: string | null; exists: boolean };

function Missing({ result }: { result: Exclude<OnboardingLoad, { kind: 'ok' }> }) {
  return result.kind === 'not-found' ? (
    <>
      <p>설비를 찾을 수 없습니다</p>
      <p><Link href={hrefFor({ name: 'fleet' })}>Fleet으로 이동</Link></p>
    </>
  ) : (
    <>
      <p role="alert">데이터 오류: {result.error}</p>
      <p><Link href={hrefFor({ name: 'fleet' })}>Fleet으로 이동</Link></p>
    </>
  );
}

function StartActions({ equipmentId, result, draft }: { equipmentId: string; result: Ok; draft: Extract<DraftLookup, { kind: 'absent' | 'no-id' }> }) {
  // The parent keys this component by equipmentId, so the state never crosses equipment.
  const [create, setCreate] = useState<CreateState>({ pending: false, error: null, exists: false });
  const active = useRef<string | null>(null);
  useEffect(() => {
    active.current = equipmentId;
    return () => { active.current = null; };
  }, [equipmentId]);

  const start = async (choice: Choice) => {
    if (draft.kind !== 'absent' || create.pending) return;
    setCreate({ pending: true, error: null, exists: false });
    try {
      const source: TemplateDocument | EquipmentLayoutDocument | undefined = choice.kind === 'generic'
        ? buildGenericLayout({ inventory: result.data.inventory, dictionaries: result.data.dictionaries }).layout
        : result.templates.find(({ id }) => id === choice.templateId);
      if (!source) throw new Error('Template을 찾을 수 없습니다');
      await createDraft(draft.layoutId, instantiateLayout(source, draft.layoutId));
      if (active.current === equipmentId) navigate(hrefFor({ name: 'board', equipmentId }));
    } catch (error) {
      if (active.current !== equipmentId) return;
      const exists = error instanceof ApiError && error.status === 412;
      setCreate({ pending: false, exists,
        error: exists ? '이미 레이아웃 draft가 있습니다' : message(error) });
    }
  };
  const blocked = draft.kind === 'no-id';
  return (
    <>
      {blocked && <p>설비 id로 레이아웃 id를 만들 수 없습니다</p>}
      {create.error && (
        <p role="alert">
          {create.error}{create.exists && <> <Link href={hrefFor({ name: 'board', equipmentId })}>④ Mapping Board 열기</Link></>}
        </p>
      )}
      <TemplateProposals inventory={result.data.inventory} dictionaries={result.data.dictionaries} templates={result.templates}
        action={(choice): ReactNode => (
          <button type="button" className="eqv-ed-btn eqv-ed-btn-primary"
            aria-label={choice.kind === 'generic' ? 'Generic Layout으로 시작' : `${result.templates.find(({ id }) => id === choice.templateId)!.name}으로 시작`}
            disabled={blocked || create.pending} onClick={() => { void start(choice); }}>
            {choice.kind === 'generic' ? 'Generic Layout으로 시작' : '이 템플릿으로 시작'}
          </button>
        )} />
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
      {result === null ? <p>불러오는 중…</p> : result.kind !== 'ok' ? <Missing result={result} /> : (
        <>
          <p>{result.data.record.maker} / {result.data.record.model}</p>
          {result.skippedTemplates.length > 0 && <p role="status">건너뛴 Template: {result.skippedTemplates.join(', ')}</p>}
          <InventoryView inventory={result.data.inventory} dictionaries={result.data.dictionaries} />
          {result.draft.kind === 'error' && <p role="alert">레이아웃 draft 오류: {result.draft.error}</p>}
          {result.draft.kind === 'found' ? (
            <>
              <TemplateProposals inventory={result.data.inventory} dictionaries={result.data.dictionaries} templates={result.templates} />
              <p><Link href={hrefFor({ name: 'board', equipmentId })}>④ Mapping Board 열기</Link></p>
            </>
          ) : result.draft.kind === 'error' ? (
            <TemplateProposals inventory={result.data.inventory} dictionaries={result.data.dictionaries} templates={result.templates} />
          ) : <StartActions key={equipmentId} equipmentId={equipmentId} result={result} draft={result.draft} />}
        </>
      )}
    </>
  );
}

const LEAVE_MESSAGE = '저장하지 않은 매핑 변경이 있습니다. 버리고 이동할까요?';

function LoadedBoard({ equipmentId, result, layout, onDirtyChange }: {
  equipmentId: string; result: Ok; layout: EquipmentLayoutDocument; onDirtyChange: (dirty: boolean) => void;
}) {
  const { record, inventory, dictionaries, ruleFiles } = result.data;
  const equipment = useMemo(() => ({ equipmentId, maker: record.maker, model: record.model }), [equipmentId, record.maker, record.model]);
  const onSave: MappingBoardProps['onSave'] = async (files) => {
    // The paths come from what was loaded when the save starts, not from whatever the route is by the time a write returns.
    const paths = { model: `onboarding/scopes/model/${equipment.maker}/${equipment.model}/alias-rules.json`,
      equipment: `onboarding/scopes/equipment/${equipment.equipmentId}/alias-rules.json` };
    const savedScopes: ('model' | 'equipment')[] = [];
    for (const scope of ['equipment', 'model'] as const) {
      const file = files.find((candidate) => candidate.scope === scope);
      if (!file) continue;
      try {
        await saveAliasRules(paths[scope], file.file);
        savedScopes.push(scope);
      } catch (error) {
        return { savedScopes, error: message(error) };
      }
    }
    return { savedScopes };
  };
  return (
    <MappingBoard key={equipmentId} equipment={equipment} inventory={inventory} dictionaries={dictionaries} layout={layout}
      ruleFiles={ruleFiles} templates={result.templates} onSave={onSave} onDirtyChange={onDirtyChange} />
  );
}

export function BoardPage({ equipmentId }: { equipmentId: string }) {
  // Same ownership as OnboardingPage: loaded state and the dirty flag both belong to the route's equipmentId.
  const [loaded, setLoaded] = useState<{ equipmentId: string; result: OnboardingLoad | null }>({ equipmentId, result: null });
  const [dirtyState, setDirtyState] = useState({ equipmentId, dirty: false });
  if (loaded.equipmentId !== equipmentId) setLoaded({ equipmentId, result: null });
  if (dirtyState.equipmentId !== equipmentId) setDirtyState({ equipmentId, dirty: false });
  const dirty = dirtyState.equipmentId === equipmentId && dirtyState.dirty;

  useEffect(() => {
    let cancelled = false;
    loadOnboarding(equipmentId).then((result) => { if (!cancelled) setLoaded({ equipmentId, result }); });
    return () => { cancelled = true; };
  }, [equipmentId]);

  useEffect(() => {
    if (!dirty) return undefined;
    setNavigationBlocker(() => window.confirm(LEAVE_MESSAGE));
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      setNavigationBlocker(null);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [dirty]);

  const { result } = loaded;
  return (
    <>
      {result?.kind === 'ok' && result.draft.kind === 'found'
        ? <p>설비 <code>{equipmentId}</code></p> : <h1>Mapping Board <code>{equipmentId}</code></h1>}
      <p><Link href={hrefFor({ name: 'onboarding', equipmentId })}>Onboarding으로 이동</Link></p>
      {result === null ? <p>불러오는 중…</p> : result.kind !== 'ok' ? <Missing result={result} /> : result.draft.kind === 'error' ? (
        <p role="alert">레이아웃 draft 오류: {result.draft.error}</p>
      ) : result.draft.kind !== 'found' ? (
        <>
          <p>레이아웃 draft가 없습니다</p>
        </>
      ) : (
        <LoadedBoard equipmentId={equipmentId} result={result} layout={result.draft.layout}
          onDirtyChange={(next) => setDirtyState({ equipmentId, dirty: next })} />
      )}
    </>
  );
}
