import { useEffect, useId, useRef, useState } from 'react';
import {
  LEVEL_KO, aliasMetadataFileSchema, validateSampleWindow, validateTypeDictionary,
  type AliasMetadataFile, type EquipmentRecord,
  type SampleWindowSummary, type TypeDictionaryFile,
} from '@eqv/core';
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  Button, StatusBadge,
} from '@ap/ui';
import {
  CircleCheck, CircleX, FileJson, Info, Replace, TriangleAlert, Upload, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  DataTable, DetailFields, EvidenceBadge, LoadingBlock, Panel, StateMessage,
  type DetailField,
} from '@eqv/ui';
import { ApiError, importWindow, putAliasMetadata, putTypeDictionary } from './api.js';
import { checkScope, readAliasMetadata, shortWindowHash } from './onboarding-data.js';
import { errorMessage } from './error-message.js';
import type { EquipmentDataLoad, FileState } from './equipment-data.js';

export type ImportKind = 'window' | 'alias-metadata' | 'type-dictionary';
export type ImportOutcome = { kind: 'window'; name: string; from: string; to: string; created: boolean }
  | { kind: 'alias-metadata'; aliases: number; created: boolean }
  | { kind: 'type-dictionary'; entries: number };
export interface ImportPreviewProps {
  kind: ImportKind;
  file: File;
  record: EquipmentRecord;
  windows: Extract<EquipmentDataLoad, { kind: 'ok' }>['windows'];
  typeDictionary: FileState;
  maxBytes: number;
  blocked: boolean;
  onBusyChange(busy: boolean): void;
  onImported(outcome: ImportOutcome): void;
  onStale(): void;
  onClose(): void;
}

type Problem = { code: string; path: (string | number)[]; message: string };
type Notice = { tone: 'danger' | 'warning'; icon: LucideIcon; title: string; body: ReactNode };
type AliasCurrent = { kind: 'absent' } | { kind: 'ok'; file: AliasMetadataFile } | { kind: 'unreadable'; message: string };
type AliasDiff = { added: number; deleted: number; changed: number; unchanged: number };
class FileReadError extends Error {}
type Inspection = {
  text: string;
  rejects: Problem[];
  warnings: Problem[];
  summary?: SampleWindowSummary | Omit<SampleWindowSummary, 'name' | 'hash'>;
  alias?: { file?: AliasMetadataFile; current: AliasCurrent; diff?: AliasDiff };
  dictionary?: { file?: TypeDictionaryFile };
  notice: Notice | null;
  server: boolean;
  locked: boolean;
};
type PreviewState = { kind: 'checking' } | { kind: 'ready'; inspection: Inspection };

const SCHEMA_HELP = '원천이 짝지은 Occurrence만 가져옵니다. Start/End 점 이벤트나 원시 로그는 원천 변환기에서 Occurrence로 바꾼 뒤 가져오세요(ADR-0002).';
const TITLES: Record<ImportKind, string> = {
  window: 'Sample Window 미리보기',
  'alias-metadata': 'Alias metadata 미리보기',
  'type-dictionary': 'Type Dictionary 미리보기',
};
const issueProblems = (issues: readonly { code: string; path: readonly PropertyKey[]; message: string }[]): Problem[] =>
  issues.map(({ code, path, message }) => ({ code, path: path.map(String), message }));
const pathText = (path: readonly (string | number)[]) => path.map(String).join('.') || '(root)';
const hasSchema = (problems: readonly Problem[]) => problems.some(({ code }) => code === 'schema');
const withSchemaHelp = (message: string, problems: readonly Problem[]) => hasSchema(problems) ? <>{message}<br />{SCHEMA_HELP}</> : message;
const rejectNotice = (rejects: readonly Problem[]): Notice | null => rejects.length > 0
  ? { tone: 'danger', icon: CircleX, title: '가져올 수 없습니다', body: withSchemaHelp(`거부 ${rejects.length}건이 있습니다. 아래 표의 code와 위치를 확인하세요.`, rejects) }
  : null;
const isIssue = (item: unknown): item is { code: string; path: PropertyKey[]; message: string } =>
  item !== null && typeof item === 'object'
  && typeof (item as { code?: unknown }).code === 'string'
  && Array.isArray((item as { path?: unknown }).path)
  && typeof (item as { message?: unknown }).message === 'string';

function aliasDiff(current: AliasMetadataFile, next: AliasMetadataFile): AliasDiff {
  const previous = new Map(current.aliases.map((entry) => [entry.alias, JSON.stringify([entry.moduleType, entry.isPort, entry.isRobot])]));
  const incoming = new Map(next.aliases.map((entry) => [entry.alias, JSON.stringify([entry.moduleType, entry.isPort, entry.isRobot])]));
  let added = 0;
  let deleted = 0;
  let changed = 0;
  let unchanged = 0;
  for (const [alias, value] of incoming) {
    const old = previous.get(alias);
    if (old === undefined) added++;
    else if (old === value) unchanged++;
    else changed++;
  }
  for (const alias of previous.keys()) if (!incoming.has(alias)) deleted++;
  return { added, deleted, changed, unchanged };
}

async function currentAlias(equipmentId: string): Promise<AliasCurrent> {
  try {
    const file = await readAliasMetadata(equipmentId);
    return file === undefined ? { kind: 'absent' } : { kind: 'ok', file };
  } catch (error) {
    return { kind: 'unreadable', message: errorMessage(error) };
  }
}

function clientNotice(file: File, maxBytes: number, error: unknown): Notice {
  if (error instanceof RangeError) {
    return {
      tone: 'danger', icon: CircleX, title: '파일이 가져오기 상한을 넘습니다',
      body: `${(maxBytes / 1048576).toFixed(1)} MiB까지 가져올 수 있습니다. 이 파일은 ${(file.size / 1048576).toFixed(1)} MiB입니다.`,
    };
  }
  const kind = error instanceof SyntaxError ? 'json' : 'read';
  return kind === 'json'
    ? { tone: 'danger', icon: FileJson, title: 'JSON으로 읽을 수 없습니다', body: errorMessage(error) }
    : { tone: 'danger', icon: CircleX, title: '파일을 읽을 수 없습니다', body: errorMessage(error) };
}

async function inspect(props: ImportPreviewProps): Promise<Inspection> {
  const { kind, file, record, windows, maxBytes, typeDictionary } = props;
  if (file.size > maxBytes) throw new RangeError('size');
  let text: string;
  try {
    text = await file.text();
  } catch (error) {
    throw new FileReadError(errorMessage(error), { cause: error });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (error) {
    throw new SyntaxError(errorMessage(error), { cause: error });
  }

  if (kind === 'window') {
    const existing = windows.kind === 'ok' ? windows.rows.flatMap((row) => row.kind === 'ok'
      ? [{ from: row.entry.from, to: row.entry.to, hash: row.entry.hash, timeDomain: row.timeDomain }]
      : []) : [];
    const result = await validateSampleWindow(raw, { equipmentId: record.equipmentId, existing });
    const rejects = result.ok ? [] : issueProblems(result.issues);
    const warnings = issueProblems(result.warnings);
    const summary = result.summary;
    const notice = rejectNotice(rejects);
    return { text, rejects, warnings, ...(summary === undefined ? {} : { summary }), notice, server: false, locked: false };
  }

  if (kind === 'alias-metadata') {
    const parsed = aliasMetadataFileSchema.safeParse(raw);
    const rejects = parsed.success ? [] : issueProblems(parsed.error.issues.map((issue) => ({ code: issue.code, path: issue.path, message: issue.message })));
    if (parsed.success && parsed.data.equipmentId !== record.equipmentId) {
      rejects.push({ code: 'equipment-mismatch', path: ['equipmentId'], message: `파일의 equipmentId(${parsed.data.equipmentId})가 이 설비(${record.equipmentId})와 다릅니다` });
    }
    const current = await currentAlias(record.equipmentId);
    const fileData = parsed.success ? parsed.data : undefined;
    const diff = fileData && current.kind === 'ok' ? aliasDiff(current.file, fileData) : undefined;
    const notice = rejectNotice(rejects);
    return { text, rejects, warnings: [], alias: { ...(fileData ? { file: fileData } : {}), current, ...(diff ? { diff } : {}) }, notice, server: false, locked: false };
  }

  const result = validateTypeDictionary(raw);
  const rejects = result.ok ? [] : issueProblems(result.issues);
  const fileData = result.ok ? result.file : undefined;
  if (fileData) {
    try {
      checkScope(`onboarding/scopes/model/${record.maker}/${record.model}/type-dictionary.json`, fileData.scope,
        { level: 'model', maker: record.maker, model: record.model });
    } catch (error) {
      rejects.push({ code: 'scope-mismatch', path: ['scope'], message: errorMessage(error) });
    }
  }
  const exists = typeDictionary.kind === 'ok';
  const notice: Notice | null = rejectNotice(rejects) ?? (exists
      ? { tone: 'warning' as const, icon: TriangleAlert, title: '이 Model의 Type Dictionary가 이미 있습니다', body: 'Studio는 Type Dictionary를 처음 한 번만 가져옵니다(create-only). 바꾸려면 데이터 루트의 파일을 직접 고치세요.' }
      : null);
  return { text, rejects, warnings: [], dictionary: { ...(fileData ? { file: fileData } : {}) }, notice, server: false, locked: false };
}

function alertNotice(notice: Notice) {
  return <StateMessage compact tone={notice.tone} icon={notice.icon} title={notice.title} body={notice.body} />;
}

function rowsFor(inspection: Inspection) {
  return [
    ...inspection.rejects.map((problem) => ({ problem, tone: 'danger' as const, text: '거부' })),
    ...inspection.warnings.map((problem) => ({ problem, tone: 'warning' as const, text: '경고' })),
  ];
}

function WindowDetails({ summary }: { summary: Inspection['summary'] }) {
  if (summary === undefined) return null;
  const levels = ['observed', 'derived', 'illustrative', 'unknown'] as const;
  const evidence = (counts: typeof summary.boundaryEvidence) => (
    <span className="flex flex-wrap items-center gap-2">
      {levels.map((level) => <EvidenceBadge key={level} level={level}>{LEVEL_KO[level]} {counts[level]}</EvidenceBadge>)}
    </span>
  );
  const items: DetailField[] = [
    { key: 'range', label: '구간', value: `${summary.from} – ${summary.to}`, mono: true },
    { key: 'timeDomain', label: 'timeDomain', value: summary.timeDomain, mono: true },
    { key: 'generation', label: 'Data Generation', value: summary.dataGeneration, mono: true },
    { key: 'parser', label: 'parserContractVersion', value: summary.parserContractVersion, mono: true },
    { key: 'watermark', label: 'Watermark', value: `${summary.watermark.at} · seq ${summary.watermark.seq}`, mono: true },
    { key: 'seq', label: 'Record Sequence', value: summary.seq === null ? '—' : `${summary.seq.min} – ${summary.seq.max}`, mono: true },
    { key: 'occurrences', label: 'Occurrence', value: `${summary.occurrences}개 · 열린 Occurrence ${summary.openOccurrences}개` },
    { key: 'null-boundaries', label: '시각 없는 경계', value: `${summary.nullBoundaryTimes}개 (at: null)` },
    { key: 'dqi', label: 'Data Quality Issue', value: `${summary.dataQualityIssues}개${Object.keys(summary.dataQualityIssuesByType).sort().map((key) => ` · ${key} ${summary.dataQualityIssuesByType[key]}개 보존됨`).join('')}` },
    { key: 'aliases', label: 'alias', value: `${summary.aliases}개` },
    { key: 'boundary-evidence', label: '경계 근거', value: evidence(summary.boundaryEvidence) },
    { key: 'identity-evidence', label: '식별 근거', value: evidence(summary.identityEvidence) },
    ...('hash' in summary ? [{ key: 'hash', label: 'hash', value: shortWindowHash(summary.hash), mono: true }] : []),
  ];
  return <DetailFields items={items} />;
}

function AliasDetails({ alias }: { alias: NonNullable<Inspection['alias']> }) {
  const { file, current, diff } = alias;
  const currentText = current.kind === 'absent' ? '없음' : current.kind === 'ok' ? `alias ${current.file.aliases.length}개` : `읽을 수 없음: ${current.message}`;
  const items: DetailField[] = [
    { key: 'equipment', label: 'equipmentId', value: file?.equipmentId ?? '—', mono: true },
    { key: 'aliases', label: 'alias', value: file ? `${file.aliases.length}개` : '—' },
    { key: 'current', label: '현재 파일', value: currentText },
    ...(diff ? [{ key: 'diff', label: '변경', value: `추가 ${diff.added}개 · 삭제 ${diff.deleted}개 · 변경 ${diff.changed}개 · 그대로 ${diff.unchanged}개` }] : []),
  ];
  return <DetailFields items={items} />;
}

function DictionaryDetails({ dictionary, record, typeDictionary }: {
  dictionary: NonNullable<Inspection['dictionary']>; record: EquipmentRecord; typeDictionary: FileState;
}) {
  const currentText = typeDictionary.kind === 'absent' ? '없음'
    : typeDictionary.kind === 'ok' ? `ModuleType ${typeDictionary.count}개 (이미 있음)`
      : `읽을 수 없음: ${typeDictionary.error}`;
  return <DetailFields items={[
    { key: 'scope', label: '범위', value: `model · ${record.maker} / ${record.model}`, mono: true },
    { key: 'entries', label: '항목', value: dictionary.file ? `ModuleType ${dictionary.file.entries.length}개` : '—' },
    { key: 'current', label: '현재 파일', value: currentText },
  ]} />;
}

function DialogCopy({ inspection }: { inspection: Inspection }) {
  const alias = inspection.alias;
  if (alias?.current.kind === 'unreadable') {
    return `현재 파일을 읽을 수 없어 차이를 셀 수 없습니다: ${alias.current.message}. 새 파일의 alias는 ${alias.file?.aliases.length ?? 0}개입니다.`;
  }
  const diff = alias?.diff ?? { added: 0, deleted: 0, changed: 0, unchanged: 0 };
  return `추가 ${diff.added}개 · 삭제 ${diff.deleted}개 · 변경 ${diff.changed}개 · 그대로 ${diff.unchanged}개. 게시된 Baseline Inventory는 바뀌지 않습니다(ADR-0007). 다음 Onboarding부터 새 metadata로 Inventory를 만듭니다.`;
}

function serverNotice(error: ApiError, kind: ImportKind): { notice: Notice; serverProblems?: { rejects: Problem[]; warnings: Problem[] }; locked: boolean } {
  const body = error.body as { error?: unknown; issues?: unknown; warnings?: unknown } | null;
  const message = typeof body?.error === 'string' ? body.error : error.message;
  if (Array.isArray(body?.issues)) {
    const rejects = issueProblems(body.issues.filter(isIssue));
    const warnings = Array.isArray(body.warnings) ? issueProblems(body.warnings.filter(isIssue)) : [];
    return {
      notice: { tone: 'danger', icon: CircleX, title: '서버가 가져오기를 거부했습니다', body: withSchemaHelp(message, rejects) },
      serverProblems: { rejects, warnings }, locked: error.status !== null && error.status < 500,
    };
  }
  const detail: Notice = error.status === 409
    ? { tone: 'danger', icon: CircleX, title: '같은 이름의 다른 파일이 이미 있습니다', body: message }
    : error.status === 412 && kind === 'alias-metadata'
      ? { tone: 'danger', icon: CircleX, title: 'alias metadata: 다른 곳에서 먼저 저장했습니다', body: '화면을 다시 불러왔습니다. 다시 고르면 차이를 보고 교체할 수 있습니다.' }
      : error.status === 412
        ? { tone: 'danger', icon: CircleX, title: '이 Model의 Type Dictionary가 이미 있습니다', body: 'Studio는 Type Dictionary를 처음 한 번만 가져옵니다(create-only). 바꾸려면 데이터 루트의 파일을 직접 고치세요.' }
        : error.status === 413
          ? { tone: 'danger', icon: CircleX, title: '파일이 가져오기 상한을 넘습니다', body: message }
          : error.status === 403
            ? { tone: 'danger', icon: CircleX, title: '가져오기를 쓸 수 없습니다', body: `사유: ${message}` }
            : error.status === 404
              ? { tone: 'danger', icon: CircleX, title: '등록된 설비를 찾을 수 없습니다', body: message }
              : { tone: 'danger', icon: CircleX, title: '가져오지 못했습니다', body: error.status === null ? '서버에 연결할 수 없습니다' : message };
  return { notice: detail, locked: error.status !== null && error.status < 500 };
}

export function ImportPreview(props: ImportPreviewProps) {
  const { kind, file, record, windows, typeDictionary, maxBytes, blocked, onBusyChange, onImported, onStale, onClose } = props;
  const [initial] = useState(() => ({ kind, file, record, windows, typeDictionary, maxBytes }));
  const [state, setState] = useState<PreviewState>({ kind: 'checking' });
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const reasonId = useId();
  const mounted = useRef(false);
  const initialFocusDone = useRef(false);
  const importRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    inspect({ ...initial, blocked, onBusyChange, onImported, onStale, onClose })
      .then((inspection) => { if (!cancelled && mounted.current) setState({ kind: 'ready', inspection }); })
      .catch((error: unknown) => {
        if (cancelled || !mounted.current) return;
        setState({ kind: 'ready', inspection: {
          text: '', rejects: [], warnings: [], notice: clientNotice(initial.file, initial.maxBytes, error), server: false, locked: true,
        } });
      });
    return () => { cancelled = true; };
  }, [initial]);

  const inspection = state.kind === 'ready' ? state.inspection : null;
  const hasClientRejects = (inspection?.rejects.length ?? 0) > 0;
  const dictionaryExists = kind === 'type-dictionary' && initial.typeDictionary.kind === 'ok';
  const disabled = blocked || busy || state.kind === 'checking' || hasClientRejects || dictionaryExists || inspection?.locked === true;

  useEffect(() => {
    if (state.kind !== 'ready' || initialFocusDone.current) return;
    initialFocusDone.current = true;
    (disabled ? closeRef.current : importRef.current)?.focus();
  }, [state, disabled]);

  const write = async (replace: boolean) => {
    if (disabled || inspection === null) return;
    setConfirmOpen(false);
    setBusy(true);
    onBusyChange(true);
    try {
      if (kind === 'window') {
        const result = await importWindow(record.equipmentId, inspection.text);
        onImported({ kind: 'window', name: result.summary.name, from: result.summary.from, to: result.summary.to, created: result.created });
        return;
      }
      if (kind === 'alias-metadata') {
        const fileData = inspection.alias?.file;
        if (fileData === undefined) return;
        const result = await putAliasMetadata(record.equipmentId, inspection.text, { createOnly: !replace && inspection.alias?.current.kind === 'absent' });
        onImported({ kind: 'alias-metadata', aliases: fileData.aliases.length, created: result.created });
        return;
      }
      const fileData = inspection.dictionary?.file;
      if (fileData === undefined) return;
      await putTypeDictionary(record.maker, record.model, inspection.text);
      onImported({ kind: 'type-dictionary', entries: fileData.entries.length });
    } catch (error) {
      if (error instanceof ApiError) {
        const result = serverNotice(error, kind);
        if (mounted.current) setState({ kind: 'ready', inspection: {
          ...inspection,
          ...(result.serverProblems ? result.serverProblems : {}),
          notice: result.notice,
          server: result.serverProblems !== undefined,
          locked: result.locked,
        } });
        if (mounted.current && (error.status === 409 || error.status === 412)) onStale();
      } else if (mounted.current) {
        setState({ kind: 'ready', inspection: { ...inspection, notice: { tone: 'danger', icon: CircleX, title: '가져오지 못했습니다', body: errorMessage(error) }, locked: false } });
      }
    } finally {
      if (mounted.current) setBusy(false);
      onBusyChange(false);
    }
  };

  const closeDialog = (open: boolean) => {
    setConfirmOpen(open);
    if (!open) requestAnimationFrame(() => importRef.current?.focus());
  };

  const startWrite = () => {
    if (disabled || inspection === null) return;
    if (kind === 'alias-metadata' && inspection.alias?.current.kind !== 'absent') {
      setConfirmOpen(true);
      return;
    }
    void write(false);
  };

  const warningList = inspection ? rowsFor(inspection) : [];
  const showAllClear = inspection !== null && warningList.length === 0 && inspection.notice === null
    && !inspection.locked && !dictionaryExists && !blocked && !busy;
  const windowName = inspection?.summary && 'name' in inspection.summary ? inspection.summary.name : null;
  const details = inspection === null ? null : kind === 'window'
    ? <WindowDetails summary={inspection.summary} />
    : kind === 'alias-metadata' && inspection.alias
      ? <AliasDetails alias={inspection.alias} />
      : kind === 'type-dictionary' && inspection.dictionary
        ? <DictionaryDetails dictionary={inspection.dictionary} record={record} typeDictionary={typeDictionary} /> : null;
  const message = kind === 'window'
    ? '문제가 있으면 원천 변환을 고친 뒤 다시 가져오세요. Start/End 점 이벤트나 원시 로그는 받지 않습니다.'
    : '문제가 있으면 원본 파일을 고친 뒤 다시 가져오세요.';
  const dialogDescription = inspection === null ? '' : <DialogCopy inspection={inspection} />;

  return (
    <>
      <Panel title={TITLES[kind]} subtitle={`${file.name} · ${(file.size / 1024).toFixed(1)} KiB`}
        actions={<>
          <Button ref={importRef} type="button" variant="primary" size="sm" loading={busy} disabled={disabled}
            aria-describedby={disabled ? reasonId : undefined} onClick={startWrite}>
            <Upload className="size-3.5" aria-hidden />가져오기
          </Button>
          <Button ref={closeRef} type="button" variant="secondary" size="sm" onClick={onClose}><X className="size-3.5" aria-hidden />닫기</Button>
        </>}>
        <div className="grid gap-3">
          <StateMessage compact icon={Info} title="가져오기는 값을 고치지 않습니다" body={message} />
          {state.kind === 'checking' ? <LoadingBlock label="검사 중…" /> : inspection !== null ? <>
            {inspection.notice !== null && <div id={reasonId}>{alertNotice(inspection.notice)}</div>}
            {kind === 'window' && inspection.warnings.some(({ code }) => code === 'no-occurrences') && (
              <StateMessage compact tone="warning" icon={TriangleAlert} title="Occurrence가 0건입니다" body="이 window로는 Inventory를 만들 수 없습니다." />
            )}
            {kind === 'window' && windowName !== null
              && windows.kind === 'ok' && windows.rows.some((row) => row.entry.name === windowName) && (
                <StateMessage compact icon={Info} title="같은 내용의 window가 이미 있습니다" body="가져오면 새로 쓰지 않고 그대로 둡니다." />
              )}
            {details}
            {warningList.length > 0 ? (
              <DataTable label="가져오기 문제" title={inspection.server ? '서버 판정' : '문제'} headingLevel={3}
                count={`거부 ${inspection.rejects.length}건 · 경고 ${inspection.warnings.length}건`}
                columns={[
                  { id: 'verdict', header: '판정' },
                  { id: 'code', header: 'code' },
                  { id: 'path', header: '위치' },
                  { id: 'message', header: '내용' },
                ]}>
                {warningList.map(({ problem, tone, text }, index) => (
                  <DataTable.Row key={`${problem.code}-${pathText(problem.path)}-${index}`}>
                    <DataTable.Cell><StatusBadge tone={tone} dot>{text}</StatusBadge></DataTable.Cell>
                    <DataTable.Cell mono>{problem.code}</DataTable.Cell>
                    <DataTable.Cell mono>{pathText(problem.path)}</DataTable.Cell>
                    <DataTable.Cell>{problem.message}</DataTable.Cell>
                  </DataTable.Row>
                ))}
              </DataTable>
            ) : showAllClear ? (
              <StateMessage compact icon={CircleCheck} title="거부나 경고가 없습니다" />
            ) : null}
          </> : null}
        </div>
      </Panel>
      <AlertDialog open={confirmOpen} onOpenChange={closeDialog}>
        <AlertDialogContent role="alertdialog" onOpenAutoFocus={(event) => { event.preventDefault(); cancelRef.current?.focus(); }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Alias metadata를 교체할까요?</AlertDialogTitle>
            <AlertDialogDescription>{dialogDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button ref={cancelRef} type="button" variant="secondary" size="sm" onClick={() => closeDialog(false)}>취소</Button>
            <Button type="button" variant="primary" size="sm" onClick={() => { void write(true); }}>
              <Replace className="size-3.5" aria-hidden />교체
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
