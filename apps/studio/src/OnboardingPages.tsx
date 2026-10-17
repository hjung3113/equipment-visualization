import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode, type SyntheticEvent } from 'react';
import { buildGenericLayout, instantiateLayout, type EquipmentLayoutDocument, type TemplateDocument } from '@eqv/core';
import {
  FleetTable, InventoryView, MappingBoard, modelDryRunRows, PublishPanel, summarizeFleet, TemplateProposals,
  type FleetRow, type MappingBoardProps, type ModelDryRunInput, type PublishPanelProps, type PublishPlan, type RuleFiles,
} from '@eqv/editor';
import { ApiError, createDraft, publishRevision, putImmutable, saveAliasRules, saveBindings } from './api.js';
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
          {(result.data.bindings?.bindings.length ?? 0) > 0 && (
            <p><Link href={hrefFor({ name: 'focus', equipmentId, entityType: null, anchor: null })}>Focus 열기</Link></p>
          )}
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

type PublishOutcome = Awaited<ReturnType<PublishPanelProps['onPublish']>>;
type Publication = { publishing: boolean; receipt: PublishPanelProps['receipt']; run(plan: PublishPlan, execute: () => Promise<PublishOutcome>): Promise<PublishOutcome> };

/** D5: revision, Mapping Version, Baseline Inventory, then the bindings file (the commit point). Stops at the first failing step. */
async function writePublication(plan: PublishPlan, layout: EquipmentLayoutDocument): Promise<PublishOutcome> {
  const { mapping, bindings } = plan;
  if (!mapping || !bindings) return { ok: false, error: '게시할 수 없는 상태입니다' };
  const hex = mapping.hash.slice('sha256:'.length);
  const { equipmentId } = mapping;
  const steps: [string, () => Promise<void>][] = [
    ['① Layout Revision', async () => {
      const { revision } = await publishRevision(layout);
      if (revision !== plan.layoutRevision) throw new Error('저장된 revision이 계획과 다릅니다');
    }],
    ['② Mapping Version', () => putImmutable(`onboarding/mappings/${equipmentId}/${hex}.mapping.json`, mapping)],
    ['③ Baseline Inventory', async () => {
      try {
        await putImmutable(`onboarding/baselines/${equipmentId}/${hex}.inventory.json`, plan.baseline);
      } catch (error) {
        // A baseline for this Mapping Version already exists: the first one stays the Drift reference.
        if (!(error instanceof ApiError && error.status === 409)) throw error;
      }
    }],
    ['④ bindings', () => saveBindings(equipmentId, bindings)],
  ];
  for (const [name, write] of steps) {
    try {
      await write();
    } catch (error) {
      return { ok: false, error: `${name} 단계 실패: ${message(error)}` };
    }
  }
  return { ok: true, mappingHash: mapping.hash };
}

function LoadedBoard({ equipmentId, result, layout, onDirtyChange, publication }: {
  equipmentId: string; result: Ok; layout: EquipmentLayoutDocument; onDirtyChange: (dirty: boolean) => void; publication: Publication;
}) {
  const { record, inventory, dictionaries, ruleFiles, bindings, mappings } = result.data;
  const equipment = useMemo(() => ({ equipmentId, maker: record.maker, model: record.model }), [equipmentId, record.maker, record.model]);
  // The rule files as saved: what a dry-run and Publish read. Unsaved Board edits are not part of them.
  const [saved, setSaved] = useState<RuleFiles>(ruleFiles);
  const [highlight, setHighlight] = useState<MappingBoardProps['highlight']>(null);
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
        setSaved((previous) => ({ ...previous, [scope]: file.file }));
      } catch (error) {
        return { savedScopes, error: message(error) };
      }
    }
    return { savedScopes };
  };
  const [dirty, setDirty] = useState(false);
  const input = useMemo(() => ({ equipment, inventory, dictionaries, layout, ruleFiles: saved }),
    [equipment, inventory, dictionaries, layout, saved]);
  const latest = bindings?.bindings.length ? bindings.bindings.reduce((a, b) => b.effectiveFrom > a.effectiveFrom ? b : a) : null;
  const previous = latest ? mappings[latest.mappingHash] ?? null : null;

  const onModelDryRun = async () => {
    const ids = await listEquipmentIds();
    const loads = await Promise.all(ids.map((id) => loadOnboarding(id)));
    const rows: ModelDryRunInput[] = [];
    let unreadable = 0;
    loads.forEach((load, i) => {
      const id = ids[i]!;
      if (load.kind === 'not-found') { unreadable++; return; }
      if (load.kind === 'error') {
        if (!load.record) unreadable++;
        else if (load.record.maker === equipment.maker && load.record.model === equipment.model) rows.push({ equipmentId: id, published: null, error: load.error });
        return;
      }
      const { data } = load;
      if (data.record.maker !== equipment.maker || data.record.model !== equipment.model) return;
      const published = (data.bindings?.bindings.length ?? 0) > 0;
      if (load.draft.kind === 'error') {
        rows.push({ equipmentId: id, published, error: `레이아웃 draft 오류: ${load.draft.error}` });
        return;
      }
      rows.push({ equipmentId: id, published, input: {
        equipment: { equipmentId: id, maker: data.record.maker, model: data.record.model }, inventory: data.inventory,
        dictionaries: data.dictionaries, layout: load.draft.kind === 'found' ? load.draft.layout : null, ruleFiles: data.ruleFiles,
      } });
    });
    return { rows: await modelDryRunRows(rows), unreadable };
  };

  // While publishing the Board is inert; the capture guard keeps a synthetic or scripted event from reaching it as well.
  const guard = publication.publishing ? (event: SyntheticEvent) => { event.stopPropagation(); event.preventDefault(); } : undefined;
  return (
    <>
      <PublishPanel input={input} bindings={bindings} previous={previous} boardDirty={dirty}
        publishing={publication.publishing} receipt={publication.receipt}
        onPublish={(plan) => publication.run(plan, () => writePublication(plan, layout))}
        onHighlight={setHighlight} onModelDryRun={onModelDryRun}
        renderLink={(id) => <Link href={hrefFor({ name: 'board', equipmentId: id })}>{id}</Link>} />
      <div inert={publication.publishing} onClickCapture={guard} onKeyDownCapture={guard} onDropCapture={guard}>
        <MappingBoard key={equipmentId} equipment={equipment} inventory={inventory} dictionaries={dictionaries} layout={layout}
          ruleFiles={ruleFiles} templates={result.templates} onSave={onSave} highlight={highlight}
          onDirtyChange={(next) => { setDirty(next); onDirtyChange(next); }} />
      </div>
    </>
  );
}

export function BoardPage({ equipmentId }: { equipmentId: string }) {
  const [visit, setVisit] = useState({ equipmentId, generation: 0 });
  if (visit.equipmentId !== equipmentId) setVisit({ equipmentId, generation: visit.generation + 1 });
  // Same ownership as OnboardingPage: loaded state and the dirty flag both belong to the route's equipmentId.
  const [loaded, setLoaded] = useState<{ equipmentId: string; result: OnboardingLoad | null }>({ equipmentId, result: null });
  const [dirtyState, setDirtyState] = useState({ equipmentId, dirty: false });
  if (loaded.equipmentId !== equipmentId) setLoaded({ equipmentId, result: null });
  if (dirtyState.equipmentId !== equipmentId) setDirtyState({ equipmentId, dirty: false });
  const dirty = dirtyState.equipmentId === equipmentId && dirtyState.dirty;
  // The publication outlives the reload that follows it, so its flag and receipt live here, above the Board.
  const [publicationState, setPublicationState] = useState<{ equipmentId: string; publishing: boolean; receipt: PublishPanelProps['receipt']; reloads: number }>(
    { equipmentId, publishing: false, receipt: null, reloads: 0 });
  if (publicationState.equipmentId !== equipmentId) setPublicationState({ equipmentId, publishing: false, receipt: null, reloads: 0 });
  const publicationNow = publicationState.equipmentId === equipmentId ? publicationState : { equipmentId, publishing: false, receipt: null, reloads: 0 };
  const owner = useRef<{ visit: typeof visit; operation: symbol | null } | null>(null);
  useEffect(() => {
    owner.current = { visit, operation: null };
    return () => { owner.current = null; };
  }, [visit]);

  const run: Publication['run'] = async (plan, execute) => {
    const forId = equipmentId;
    if (owner.current?.visit !== visit) return { ok: false, error: '이전 Board 방문의 게시 요청입니다' };
    const operation = Symbol('publication');
    owner.current.operation = operation;
    const current = () => owner.current?.visit === visit && owner.current.operation === operation;
    setPublicationState((previous) => ({ ...previous, equipmentId: forId, publishing: true, receipt: null }));
    const outcome = await execute();
    if (!outcome.ok) {
      if (current()) setPublicationState((previous) => ({ ...previous, publishing: false }));
      return outcome;
    }
    if (!current()) return outcome;
    const reloaded = await loadOnboarding(forId);
    if (!current()) return outcome;
    setLoaded({ equipmentId: forId, result: reloaded });
    const effectiveFrom = plan.bindings!.bindings.at(-1)!.effectiveFrom;
    setPublicationState((previous) => ({ equipmentId: forId, publishing: false, receipt: { mappingHash: outcome.mappingHash, effectiveFrom }, reloads: previous.reloads + 1 }));
    return outcome;
  };

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
        <LoadedBoard key={publicationNow.reloads} equipmentId={equipmentId} result={result} layout={result.draft.layout}
          publication={{ publishing: publicationNow.publishing, receipt: publicationNow.receipt, run }}
          onDirtyChange={(next) => setDirtyState({ equipmentId, dirty: next })} />
      )}
    </>
  );
}
