import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { equipmentRecordSchema } from '@eqv/core';
import { Inbox, MapPinOff, Plus, ServerCrash, TriangleAlert } from 'lucide-react';
import { DataTable, DetailFields, FormField, LoadingBlock, Page, Panel, StateMessage, StatusBadge, type DetailField } from '@eqv/ui';
import { Button, Input } from '@fops/ui';
import { ApiError, registerEquipment } from './api.js';
import { loadEquipmentData, type EquipmentDataLoad, type FileState, type WindowRow } from './equipment-data.js';
import { ImportStatusNotices, importBlocked, useImportStatus } from './ImportStatus.js';
import { problems } from './onboarding-data.js';
import { Link, hrefFor, navigate } from './router.js';

const FIELDS = [
  { key: 'equipmentId', label: '설비 ID', hint: '파일 이름과 주소에 그대로 쓰입니다.' },
  { key: 'maker', label: 'Maker', hint: 'Maker 범위 Alias Rule과 Type Dictionary가 이 이름을 씁니다.' },
  { key: 'model', label: 'Model', hint: 'Model 범위 Type Dictionary가 이 이름을 씁니다.' },
] as const;
type FieldKey = typeof FIELDS[number]['key'];
type Values = Record<FieldKey, string>;
type FieldErrors = Partial<Record<FieldKey, ReactNode>>;
type Issue = { path: readonly PropertyKey[]; message: string };

const isField = (key: unknown): key is FieldKey => FIELDS.some((field) => field.key === key);
const labelOf = (key: FieldKey) => FIELDS.find((field) => field.key === key)!.label;
const NAME_RULE = '영문자나 숫자로 시작하고 영문자·숫자·마침표(.)·밑줄(_)·하이픈(-)만 쓸 수 있습니다.';

/** The same Korean copy for a client zod issue and a server 400 issue; the submitted value tells empty from malformed. */
const issueText = (value: string) => value === '' ? '값을 입력하세요.' : NAME_RULE;

function sortIssues(issues: readonly Issue[], values: Values): { fields: FieldErrors; other: Issue[] } {
  const fields: FieldErrors = {};
  const other: Issue[] = [];
  for (const issue of issues) {
    const key = issue.path[0];
    if (issue.path.length === 1 && isField(key)) fields[key] ??= issueText(values[key]);
    else other.push(issue);
  }
  return { fields, other };
}

const serverIssues = (body: unknown): Issue[] | null => {
  const issues = (body as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(issues)) return null;
  return issues.filter((issue): issue is Issue => Array.isArray((issue as Issue | null)?.path) && typeof (issue as Issue).message === 'string');
};

type Failure = { fields: FieldErrors; form: { message: string; detail: string | null } | null };

function classify(error: unknown, values: Values): Failure {
  const text = error instanceof Error ? error.message : '알 수 없는 오류';
  if (!(error instanceof ApiError)) return { fields: {}, form: { message: text, detail: null } };
  const body = error.body as { field?: unknown; existing?: unknown } | null;
  if (error.status === 400) {
    const issues = serverIssues(error.body);
    if (issues !== null && issues.length > 0) {
      const { fields, other } = sortIssues(issues, values);
      return { fields, form: other.length > 0 ? { message: text, detail: problems(other) } : null };
    }
  }
  if (error.status === 409 && isField(body?.field) && typeof body.existing === 'string') {
    const label = labelOf(body.field);
    return { fields: { [body.field]: `대소문자만 다른 ${label} '${body.existing}'이(가) 이미 있습니다. 같은 값이면 '${body.existing}'을(를) 그대로 쓰세요.` }, form: null };
  }
  if (error.status === 412) {
    return { fields: { equipmentId: <>이미 등록된 설비 ID입니다. <Link href={hrefFor({ name: 'equipment', equipmentId: values.equipmentId })}>설비 데이터 열기</Link></> }, form: null };
  }
  return { fields: {}, form: { message: text, detail: null } };
}

export function RegisterEquipmentPage() {
  const [values, setValues] = useState<Values>({ equipmentId: '', maker: '', model: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<{ message: string; detail: string | null } | null>(null);
  const [pending, setPending] = useState(false);
  const status = useImportStatus();
  const disabledId = useId();
  const blocked = importBlocked(status);
  const mounted = useRef(false);
  const refs: Record<FieldKey, RefObject<HTMLInputElement | null>> = {
    equipmentId: useRef<HTMLInputElement>(null), maker: useRef<HTMLInputElement>(null), model: useRef<HTMLInputElement>(null),
  };
  const focusNext = useRef<FieldKey | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  // Focus moves once the inputs are enabled again (a failed submit leaves `pending` in the same commit).
  useEffect(() => {
    const target = focusNext.current;
    if (target === null) return;
    focusNext.current = null;
    refs[target].current?.focus();
  });

  const fail = (failure: Failure) => {
    setErrors(failure.fields);
    setFormError(failure.form);
    focusNext.current = FIELDS.find(({ key }) => failure.fields[key] !== undefined)?.key ?? null;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || blocked) return;
    const record = { schemaVersion: '0.4', ...values };
    const parsed = equipmentRecordSchema.safeParse(record);
    if (!parsed.success) {
      const { fields, other } = sortIssues(parsed.error.issues, values);
      fail({ fields, form: other.length > 0 ? { message: '입력을 확인하세요', detail: problems(other) } : null });
      return;
    }
    setErrors({});
    setFormError(null);
    setPending(true);
    try {
      await registerEquipment(parsed.data);
    } catch (error) {
      if (!mounted.current) return;
      setPending(false);
      fail(classify(error, values));
      return;
    }
    if (mounted.current) navigate(hrefFor({ name: 'equipment', equipmentId: values.equipmentId }), { replace: true });
  };

  return (
    <Page title="설비 등록" breadcrumb={{ label: '경로', items: [{ key: 'fleet', label: 'Fleet', href: '/fleet' }] }} linkComponent={Link}>
      <div className="grid max-w-xl gap-4">
        <ImportStatusNotices state={status} git catalog={false} disabledId={disabledId} />
        <Panel title="설비 기록" subtitle="세 값은 영문자나 숫자로 시작하고 영문자·숫자·마침표(.)·밑줄(_)·하이픈(-)만 씁니다. 등록한 뒤에는 Studio에서 바꾸거나 지울 수 없습니다.">
          <form aria-label="설비 등록" noValidate className="grid gap-4" onSubmit={(event) => { void submit(event); }}>
            {FIELDS.map(({ key, label, hint }) => (
              <FormField key={key} label={label} required hint={hint} error={errors[key]}>
                {(control) => (
                  <Input {...control} ref={refs[key]} autoComplete="off" spellCheck={false} value={values[key]} disabled={pending}
                    onChange={(event) => {
                      const { value } = event.target;
                      setValues((previous) => ({ ...previous, [key]: value }));
                      setErrors((previous) => ({ ...previous, [key]: undefined }));
                    }} />
                )}
              </FormField>
            ))}
            {formError !== null && (
              <StateMessage compact tone="danger" icon={ServerCrash} title="등록하지 못했습니다"
                body={<>{formError.message}{formError.detail !== null && <><br />{formError.detail}</>}</>} />
            )}
            <div className="flex gap-2">
              <Button type="submit" variant="primary" size="sm" loading={pending} disabled={blocked}
                aria-describedby={blocked && status.kind !== 'loading' ? disabledId : undefined}>
                <Plus className="size-3.5" aria-hidden />등록
              </Button>
              <Button asChild variant="secondary" size="sm"><Link href={hrefFor({ name: 'fleet' })}>취소</Link></Button>
            </div>
          </form>
        </Panel>
      </div>
    </Page>
  );
}

const AWAY = (
  <Button asChild variant="secondary" size="sm"><Link href={hrefFor({ name: 'fleet' })}>Fleet으로 이동</Link></Button>
);

const badged = (children: ReactNode) => <span className="flex flex-wrap items-center gap-2">{children}</span>;

function fileValue(state: FileState, unit: string, absent: { tone: 'neutral' | 'warning'; text: string }): ReactNode {
  if (state.kind === 'ok') return `${unit} ${state.count}개`;
  if (state.kind === 'absent') return badged(<><StatusBadge tone={absent.tone}>없음</StatusBadge>{absent.text}</>);
  return badged(<><StatusBadge tone="danger" icon={TriangleAlert}>오류</StatusBadge>{state.error}</>);
}

const WINDOW_COLUMNS = [
  { id: 'range', header: '구간', className: 'whitespace-nowrap' },
  { id: 'timeDomain', header: 'timeDomain', className: 'whitespace-nowrap' },
  { id: 'dataGeneration', header: 'Data Generation', className: 'whitespace-nowrap' },
  { id: 'occurrences', header: 'Occurrence', align: 'end', className: 'whitespace-nowrap' },
  { id: 'dqi', header: 'DQI', align: 'end', className: 'whitespace-nowrap' },
  { id: 'hash', header: 'hash', className: 'whitespace-nowrap' },
  { id: 'open', header: '열기', className: 'whitespace-nowrap' },
] as const;

function WindowRows({ equipmentId, rows }: { equipmentId: string; rows: readonly WindowRow[] }) {
  return rows.map((row) => {
    const { entry } = row;
    const range = `${entry.from} – ${entry.to}`;
    if (row.kind === 'error') {
      return (
        <DataTable.Row key={entry.name}>
          <DataTable.Cell rowHeader mono>{range}</DataTable.Cell>
          <DataTable.Cell colSpan={6}><StatusBadge tone="danger" icon={TriangleAlert}>오류</StatusBadge> {row.error}</DataTable.Cell>
        </DataTable.Row>
      );
    }
    const window = entry.hash.slice('sha256:'.length);
    return (
      <DataTable.Row key={entry.name}>
        <DataTable.Cell rowHeader mono>{range}</DataTable.Cell>
        <DataTable.Cell mono>{row.timeDomain}</DataTable.Cell>
        <DataTable.Cell mono>{row.dataGeneration}</DataTable.Cell>
        <DataTable.Cell numeric>{row.occurrences}</DataTable.Cell>
        <DataTable.Cell numeric>{row.dataQualityIssues}</DataTable.Cell>
        <DataTable.Cell mono>{window.slice(0, 12)}</DataTable.Cell>
        <DataTable.Cell>
          <span className="flex items-center gap-2">
            <Button asChild variant="link" size="sm">
              <Link href={hrefFor({ name: 'onboarding', equipmentId, window })} aria-label={`${range} Onboarding 열기`}>Onboarding</Link>
            </Button>
            <Button asChild variant="link" size="sm">
              <Link href={hrefFor({ name: 'focus', equipmentId, entityType: null, anchor: null, window })} aria-label={`${range} Focus 열기`}>Focus</Link>
            </Button>
          </span>
        </DataTable.Cell>
      </DataTable.Row>
    );
  });
}

function WindowsTable({ equipmentId, windows }: { equipmentId: string; windows: Extract<EquipmentDataLoad, { kind: 'ok' }>['windows'] }) {
  const rows = windows.kind === 'ok' ? windows.rows : [];
  const state = windows.kind === 'error' ? (
    <StateMessage compact tone="danger" icon={ServerCrash} title="Sample Window 목록을 읽을 수 없습니다" body={windows.error} />
  ) : rows.length === 0 ? (
    <StateMessage compact icon={Inbox} title="Sample Window가 없습니다"
      body="원천 변환기가 만든 완전한 OccurrenceBatch 파일을 가져오면 Inventory·Template 제안·Focus를 쓸 수 있습니다. Start/End 점 이벤트나 원시 로그는 받지 않습니다." />
  ) : undefined;
  return (
    <DataTable label="Sample Window 목록" title="Sample Window" columns={WINDOW_COLUMNS}
      subtitle="가져온 관측 구간입니다. 각 window는 불변이며 Studio는 window를 합치지 않습니다."
      count={rows.length > 0 ? `${rows.length}개` : undefined} state={state}>
      <WindowRows equipmentId={equipmentId} rows={rows} />
    </DataTable>
  );
}

export function EquipmentDataPage({ equipmentId }: { equipmentId: string }) {
  // The loaded state belongs to the route's equipmentId, as in OnboardingPage.
  const [loaded, setLoaded] = useState<{ equipmentId: string; result: EquipmentDataLoad | null }>({ equipmentId, result: null });
  if (loaded.equipmentId !== equipmentId) setLoaded({ equipmentId, result: null });
  const status = useImportStatus();

  useEffect(() => {
    let cancelled = false;
    loadEquipmentData(equipmentId).then((result) => { if (!cancelled) setLoaded({ equipmentId, result }); });
    return () => { cancelled = true; };
  }, [equipmentId]);

  const { result } = loaded;
  const items = (data: Extract<EquipmentDataLoad, { kind: 'ok' }>): DetailField[] => [
    { key: 'equipmentId', label: '설비 ID', value: data.record.equipmentId, mono: true },
    { key: 'maker', label: 'Maker', value: data.record.maker, mono: true },
    { key: 'model', label: 'Model', value: data.record.model, mono: true },
    { key: 'alias', label: 'Alias metadata',
      value: fileValue(data.aliasMetadata, 'alias', { tone: 'neutral', text: 'ModuleType·Port·Robot 정보 없이 Inventory를 만듭니다' }) },
    { key: 'dictionary', label: 'Type Dictionary (Model 범위)',
      value: fileValue(data.typeDictionary, 'ModuleType', { tone: 'warning', text: '모든 Role이 unknown이 되어 Template 제안이 맞지 않습니다' }) },
  ];
  return (
    <Page title="설비 데이터" linkComponent={Link}
      breadcrumb={{ label: '경로', items: [{ key: 'fleet', label: 'Fleet', href: '/fleet' }, { key: 'equipment', label: equipmentId }] }}>
      <div className="grid max-w-5xl gap-4">
        <ImportStatusNotices state={status} git catalog />
        {result === null ? <LoadingBlock label="불러오는 중…" /> : result.kind === 'not-found' ? (
          <StateMessage icon={MapPinOff} title="설비를 찾을 수 없습니다" body="등록된 설비 기록이 없습니다." action={AWAY} />
        ) : result.kind === 'error' ? (
          <StateMessage tone="danger" icon={ServerCrash} title="데이터 오류" body={result.error} action={AWAY} />
        ) : (
          <>
            <Panel title="설비"><DetailFields items={items(result)} /></Panel>
            <WindowsTable equipmentId={equipmentId} windows={result.windows} />
          </>
        )}
      </div>
    </Page>
  );
}
