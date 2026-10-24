import { useMemo, useState } from 'react';
import {
  Download, Inbox, Play, RotateCw, Save, ServerCrash, SkipBack, TriangleAlert, Undo2,
} from 'lucide-react';
import {
  DataTable, DetailFields, FileButton, FormField, LoadingBlock, Page, Panel, StateMessage, Tabs, TabsContent, TabsList, TabsTrigger,
  ViewerZoomControls, type DataTableSort,
} from '@eqv/ui';
import { Button, Input } from '@ap/ui';

// Dev-only gallery of every @eqv/ui component in its states, for design review against AP screens. Synthetic data, no I/O.

interface Row {
  id: string;
  model: string;
  coverage: number;
  unmapped: number;
  note: string;
}

const NOTE = '합성 메모: 긴 문장이 칸 안에서 줄바꿈되는지 확인합니다. A long synthetic note that has to wrap inside the cell without widening the table.';

const VIRTUAL_COUNT = 5000;
const virtualRows = {
  count: VIRTUAL_COUNT,
  render: (index: number) => (
    <DataTable.Row>
      <DataTable.Cell rowHeader mono>eq-synth-{String(index + 1).padStart(4, '0')}</DataTable.Cell>
      <DataTable.Cell>{index % 2 === 0 ? 'synth-model-a' : 'synth-model-b'}</DataTable.Cell>
      <DataTable.Cell>{(index * 37) % 101}%</DataTable.Cell>
    </DataTable.Row>
  ),
};

const ROWS: readonly Row[] = Array.from({ length: 40 }, (_, i) => ({
  id: `eq-synth-${String(i + 1).padStart(2, '0')}`,
  model: i % 2 === 0 ? 'synth-model-a' : 'synth-model-b',
  coverage: ((i * 37) % 101),
  unmapped: (i * 7) % 13,
  note: i % 3 === 0 ? NOTE : '합성 메모',
}));

const SHA = `sha256:${'0123456789abcdef'.repeat(4)}`;

const COLUMNS = [
  { id: 'id', header: '설비', sortable: true, className: 'whitespace-nowrap' },
  { id: 'model', header: 'Model', className: 'whitespace-nowrap' },
  { id: 'coverage', header: '커버리지', align: 'end', sortable: true, className: 'whitespace-nowrap' },
  { id: 'unmapped', header: '미매핑 참조', align: 'end', className: 'whitespace-nowrap' },
  { id: 'note', header: '메모', className: 'min-w-40 max-w-md' },
] as const;

function EquipmentTable() {
  const [sort, setSort] = useState<DataTableSort | null>(null);
  const [selected, setSelected] = useState<string | null>('eq-synth-02');
  const rows = useMemo(() => {
    const head = ROWS.slice(0, 8);
    if (sort === null) return head;
    const sign = sort.direction === 'ascending' ? 1 : -1;
    return [...head].sort((a, b) => sign * (sort.columnId === 'coverage' ? a.coverage - b.coverage : a.id.localeCompare(b.id)));
  }, [sort]);
  return (
    <DataTable
      label="설비 목록"
      title="설비 목록"
      subtitle="합성 데이터 8대"
      count="8건"
      actions={<Button variant="secondary" size="toolbar"><Download className="size-3.5" aria-hidden />내보내기</Button>}
      columns={COLUMNS}
      sort={sort}
      onSortChange={setSort}
    >
      {rows.map((row) => (
        <DataTable.Row key={row.id} selected={selected === row.id} onActivate={() => setSelected(row.id)}>
          <DataTable.Cell rowHeader mono className="whitespace-nowrap">{row.id}</DataTable.Cell>
          <DataTable.Cell className="whitespace-nowrap">{row.model}</DataTable.Cell>
          <DataTable.Cell numeric>{row.coverage}%</DataTable.Cell>
          <DataTable.Cell numeric>{row.unmapped}</DataTable.Cell>
          <DataTable.Cell className="min-w-40 max-w-md">{row.note}</DataTable.Cell>
        </DataTable.Row>
      ))}
    </DataTable>
  );
}

function ZoomHarness() {
  const [zoom, setZoom] = useState(1);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <ViewerZoomControls
        labels={{ zoomIn: '확대', zoomOut: '축소', fit: '맞춤' }}
        controls={{
          zoomIn: () => setZoom((z) => z + 1), zoomOut: () => setZoom((z) => z - 1), fit: () => setZoom(1),
          canZoomIn: zoom < 3, canZoomOut: zoom > 1, canFit: zoom !== 1,
        }}
      />
      <span className="text-xs text-text-muted tabular-nums">배율 {zoom} / 3</span>
    </div>
  );
}

export default function UiGallery() {
  const [fileName, setFileName] = useState<string | null>(null);
  return (
    <Page
      title="UI 갤러리"
      description="개발용 · @eqv/ui 컴포넌트 상태 (합성 데이터)"
      breadcrumb={{
        label: '경로',
        items: [
          { key: 'fleet', label: 'Fleet', href: '/fleet' },
          { key: 'cluster', label: '아주 긴 이름의 합성 설비 클러스터 상세 경로 라벨이 헤더에서 잘리는지 확인', href: '/layouts' },
          { key: 'dev', label: 'Dev' },
        ],
      }}
    >
      <div data-eqv-gallery="" className="grid gap-6">
        <Panel title="DataTable" subtitle="프레임 · 정렬 · 선택 · 고정 머리 · 상태">
          <div className="grid gap-6">
            <EquipmentTable />
            <DataTable label="많은 행 · 고정 머리" title="많은 행 · 고정 머리" count="40건" capped columns={['설비', 'Model', '커버리지']}>
              {ROWS.map((row) => (
                <DataTable.Row key={row.id}>
                  <DataTable.Cell rowHeader mono>{row.id}</DataTable.Cell>
                  <DataTable.Cell>{row.model}</DataTable.Cell>
                  <DataTable.Cell>{row.coverage}%</DataTable.Cell>
                </DataTable.Row>
              ))}
            </DataTable>
            <DataTable label="5,000행 · 가상 스크롤" title="5,000행 · 가상 스크롤" count="5,000건" columns={['설비', 'Model', '커버리지']} rows={virtualRows} />
            <DataTable
              label="빈 상태"
              title="빈 상태"
              columns={['설비', 'Model']}
              state={<StateMessage compact icon={Inbox} title="표시할 행이 없습니다" body="필터를 바꾸거나 다른 설비를 고르세요." />}
            >
              {null}
            </DataTable>
            <DataTable label="불러오는 중" title="불러오는 중" columns={['설비', 'Model']} state={<LoadingBlock label="불러오는 중" />}>
              {null}
            </DataTable>
            <DataTable
              label="오류"
              title="오류"
              columns={['설비', 'Model']}
              state={
                <StateMessage
                  compact
                  tone="danger"
                  icon={ServerCrash}
                  title="데이터를 읽지 못했습니다"
                  action={<Button variant="secondary" size="toolbar"><RotateCw className="size-3.5" aria-hidden />다시 시도</Button>}
                />
              }
            >
              {null}
            </DataTable>
          </div>
        </Panel>

        <Panel title="Panel" subtitle="제목 · 부제 · 동작 / 헤더 없음 / 중첩 h3">
          <div className="grid gap-4">
            <Panel title="헤더 있음" subtitle="부제 한 줄" actions={<Button variant="secondary" size="toolbar"><Download className="size-3.5" aria-hidden />내보내기</Button>}>
              <p className="m-0 text-sm text-text-primary">본문 내용</p>
            </Panel>
            <Panel>
              <p className="m-0 text-sm text-text-primary">헤더 없는 Panel</p>
            </Panel>
            <Panel title="바깥 Panel">
              <Panel title="중첩 Panel (h3)" headingLevel={3}>
                <p className="m-0 text-sm text-text-primary">안쪽 본문</p>
              </Panel>
            </Panel>
          </div>
        </Panel>

        <Panel title="StateMessage" subtitle="neutral · warning · danger, 전체와 compact">
          <div className="grid gap-3">
            <StateMessage icon={Inbox} title="항목이 없습니다" body="조건에 맞는 항목이 없습니다." />
            <StateMessage compact icon={Inbox} title="항목이 없습니다" />
            <StateMessage tone="warning" icon={TriangleAlert} title="일부만 표시합니다" body="합성 경고 본문입니다." action={<Button variant="secondary" size="toolbar"><RotateCw className="size-3.5" aria-hidden />새로 고침</Button>} />
            <StateMessage compact tone="warning" icon={TriangleAlert} title="일부만 표시합니다" />
            <StateMessage tone="danger" icon={ServerCrash} title="데이터를 읽지 못했습니다" body="합성 오류 본문입니다." />
            <StateMessage compact tone="danger" icon={ServerCrash} title="데이터를 읽지 못했습니다" />
            <LoadingBlock label="불러오는 중" rows={3} />
          </div>
        </Panel>

        <Panel title="DetailFields">
          <DetailFields
            items={[
              { key: 'location', label: '위치', value: 'synth-chamber-01' },
              { key: 'activity', label: '활동', value: '이송' },
              { key: 'start', label: '시작', value: '2026-01-01 00:00:00 · seq 12' },
              { key: 'end', label: '끝', value: '2026-01-01 00:00:05 · seq 18' },
              { key: 'mapping', label: 'Mapping Version', value: SHA, mono: true },
              { key: 'ruleset', label: 'Ruleset', value: 'synth-ruleset-v1', mono: true },
            ]}
          />
        </Panel>

        <Panel title="FileButton">
          <div className="flex flex-wrap items-center gap-3">
            <FileButton label="가져오기" accept=".json,application/json" onFile={(file) => setFileName(file.name)} />
            <FileButton label="가져오기 (비활성)" accept=".json,application/json" disabled onFile={() => undefined} />
            <span role="status" className="text-xs text-text-muted">{fileName === null ? '선택한 파일 없음' : `선택한 파일: ${fileName}`}</span>
          </div>
        </Panel>

        <Panel title="FormField" subtitle="라벨 · 힌트 · 오류 · 필수 · 비활성">
          <div className="grid max-w-md gap-4">
            <FormField label="합성 이름" hint="영문자로 시작하는 합성 값입니다.">
              {(control) => <Input {...control} defaultValue="synth-name" />}
            </FormField>
            <FormField label="필수 값" required hint="합성 힌트입니다." error="값을 입력하세요.">
              {(control) => <Input {...control} defaultValue="" />}
            </FormField>
            <FormField label="비활성 값">
              {(control) => <Input {...control} defaultValue="synth-locked" disabled />}
            </FormField>
          </div>
        </Panel>

        <Panel title="툴바 버튼">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="toolbar"><Play className="size-3.5" aria-hidden />재생</Button>
            <Button variant="secondary" size="toolbar"><SkipBack className="size-3.5" aria-hidden />이전 단계</Button>
            <Button variant="secondary" size="toolbar"><Undo2 className="size-3.5" aria-hidden />실행 취소</Button>
            <Button variant="secondary" size="toolbar"><Download className="size-3.5" aria-hidden />내보내기</Button>
            <Button variant="secondary" size="toolbar" disabled><Download className="size-3.5" aria-hidden />비활성</Button>
            <Button variant="primary" size="sm"><Save className="size-3.5" aria-hidden />저장</Button>
          </div>
        </Panel>

        <Panel title="ViewerZoomControls">
          <ZoomHarness />
        </Panel>

        <Panel title="Tabs">
          <Tabs defaultValue="one">
            <TabsList aria-label="합성 탭">
              <TabsTrigger value="one">개요</TabsTrigger>
              <TabsTrigger value="two">Occurrence 목록</TabsTrigger>
              <TabsTrigger value="three">아주 긴 이름의 탭 라벨이 어떻게 보이는지 확인</TabsTrigger>
            </TabsList>
            <TabsContent value="one"><p className="m-0 text-sm text-text-primary">개요 내용</p></TabsContent>
            <TabsContent value="two"><p className="m-0 text-sm text-text-primary">목록 내용</p></TabsContent>
            <TabsContent value="three"><p className="m-0 text-sm text-text-primary">긴 라벨 탭 내용</p></TabsContent>
          </Tabs>
        </Panel>
      </div>
    </Page>
  );
}
