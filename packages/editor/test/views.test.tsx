// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { FleetTable, InventoryView, summarizeFleet, TemplateProposals } from '../src/index.js';
import { bindings, dictionaries, inventory, mappings, record, templates } from './data.js';

afterEach(cleanup);

it('renders fleet rows with status badges, integer percentages, dashes and a host link that receives the row', () => {
  const rows = summarizeFleet([
    { record, inventory: inventory(), bindings, mappings, hasAliasRules: true, baseline: null, layout: null },
    { record: { ...record, equipmentId: 'eq-new' }, inventory: inventory(), bindings: null, mappings: {}, hasAliasRules: false, baseline: null, layout: null },
    { record: { ...record, equipmentId: 'eq-empty' }, noObservations: true },
    { equipmentId: 'eq-bad', maker: null, model: null, error: '관측 데이터 없음' },
  ]);
  render(<FleetTable rows={rows}
    renderLink={(id, children, row) => <a href={row.status === 'no-observations' ? `/equipment/${id}` : `/onboarding/${id}`}>{children}</a>} />);
  expect(screen.getByRole('link', { name: 'eq-synth-01' }).getAttribute('href')).toBe('/onboarding/eq-synth-01');
  expect(screen.getByRole('link', { name: 'eq-empty' }).getAttribute('href')).toBe('/equipment/eq-empty');
  const row = (id: string) => within(screen.getByRole('link', { name: id }).closest('tr')!);
  expect(row('eq-synth-01').getByText('게시됨')).toBeTruthy();
  expect(row('eq-synth-01').getAllByRole('cell').map((cell) => cell.textContent)).toEqual(
    ['synth-maker', 'synth-model', '게시됨', expect.stringMatching(/^\d+%$/), expect.stringMatching(/^\d+%$/), expect.any(String)]);
  expect(row('eq-new').getAllByRole('cell').map((cell) => cell.textContent).slice(2, 6)).toEqual(['미착수', '—', '—', expect.any(String)]);
  const empty = screen.getByRole('link', { name: 'eq-empty' }).closest('tr')!;
  expect(Array.from(empty.querySelectorAll('td')).map((cell) => cell.textContent)).toEqual(['synth-maker', 'synth-model', '관측 없음', '—', '—', '—']);
  expect(empty.querySelector('.text-text-danger-label')).toBeNull();
  const bad = screen.getByRole('link', { name: 'eq-bad' }).closest('tr')!;
  expect(bad.querySelector('.text-text-danger-label')?.textContent).toBe('오류');
  expect(bad.textContent).toContain('관측 데이터 없음');
  expect(screen.getAllByRole('columnheader')).toHaveLength(7);
  const table = screen.getByRole('table');
  expect(document.getElementById(table.getAttribute('aria-describedby')!)?.textContent).toBe(
    '커버리지: 해석된 참조 수 / 전체 참조 수(무시한 alias 제외). assumed 비율: assumed 규칙으로 해석된 참조 수 / 해석된 참조 수.');
});

it('adds the host action column and spans it in error rows when provided', () => {
  const rows = summarizeFleet([
    { record, inventory: inventory(), bindings, mappings, hasAliasRules: true, baseline: null, layout: null },
    { equipmentId: 'eq-bad', maker: null, model: null, error: '관측 데이터 없음' },
  ]);
  render(<FleetTable rows={rows} renderLink={(_, children) => children}
    renderActions={(row) => row.status === 'published' ? <button type="button">Replay {row.equipmentId}</button> : null} />);

  const table = screen.getByRole('table', { name: 'Fleet 표' });
  expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(
    ['설비', 'Maker', 'Model', '상태', '커버리지', 'assumed 비율', '미매핑 참조', '동작']);
  const published = screen.getByRole('row', { name: /eq-synth-01/ });
  expect(within(published).getByRole('button', { name: 'Replay eq-synth-01' })).toBeTruthy();
  const failed = screen.getByRole('row', { name: /eq-bad/ });
  expect(failed.querySelector('td[colspan="5"]')).not.toBeNull();
});


it('contains each wide table in a focusable named region', () => {
  render(<>
    <FleetTable rows={[]} renderLink={(_, children) => children} />
    <InventoryView inventory={inventory()} dictionaries={dictionaries} />
  </>);
  for (const [index, name] of ['Fleet 표', 'Alias 목록', '관측된 이송'].entries()) {
    const region = screen.getByRole('region', { name });
    expect(region.getAttribute('tabindex')).toBe('0');
    expect(screen.getAllByRole('table')[index]!.parentElement).toBe(region);
  }
});

const aliasRows = () => within(screen.getByRole('table', { name: 'Alias 목록' })).getAllByRole('row').slice(1)
  .map((row) => Array.from(row.querySelectorAll('th, td'), (cell) => cell.textContent));

it('lists unknown-Role aliases first, then Role, then alias; a missing moduleType shows a dash', () => {
  const input = inventory();
  input.aliases = input.aliases.map((row) => row.alias === 'PM2' ? { ...row, moduleType: undefined } :
    row.alias === 'PM1' ? { ...row, alias: 'PM10' } : row);
  render(<InventoryView inventory={input} dictionaries={dictionaries} />);
  const rows = aliasRows();
  expect(rows[0]!.slice(0, 3)).toEqual(['PM2', '—', 'unknown']);
  expect(rows.map(([alias, , role]) => `${role}:${alias}`)).toEqual([
    'unknown:PM2', 'unknown:VIRT_SCH', 'll:LLA', 'lp:LP1', 'pm:PM9', 'pm:PM10', 'robot:EFEM_R1', 'robot:TM_R1',
  ]);
});

it('shows activity badges, omitted flags as a dash and the sample period', () => {
  const input = inventory();
  input.aliases = input.aliases.map((row) => row.alias === 'LP1' ? { ...row, isPort: true, isRobot: false } : row);
  const pm1 = input.aliases.find(({ alias }) => alias === 'PM1')!;
  delete pm1.isPort;
  delete pm1.isRobot;
  render(<InventoryView inventory={input} dictionaries={dictionaries} />);
  const lp1 = aliasRows().find(([alias]) => alias === 'LP1')!;
  expect(lp1[3]).toBe('Port 예 · Robot 아니요');
  expect(lp1[5]).toBe('CARRIER_PRESENCE 1VISIT 3');
  expect(aliasRows().find(([alias]) => alias === 'PM1')![3]).toBe('Port — · Robot —');
  expect(screen.getByText(`표본 기간: ${input.from} – ${input.to}`)).toBeTruthy();
});

it('lists the observed transfer pairs', () => {
  const input = inventory();
  render(<InventoryView inventory={input} dictionaries={dictionaries} />);
  const rows = within(screen.getByRole('table', { name: '관측된 이송' })).getAllByRole('row').slice(1)
    .map((row) => Array.from(row.querySelectorAll('th, td'), (cell) => cell.textContent));
  expect(rows).toEqual(input.transfers.map(({ from, to, count }) => [`${from} → ${to}`, String(count)]));
  expect(rows.length).toBeGreaterThan(0);
});

const cards = () => within(screen.getByRole('heading', { name: '③ Template 제안' }).closest('section')!).getAllByRole('listitem');

it('shows the top 3 proposals in rank order with the fitting template first', () => {
  render(<TemplateProposals inventory={inventory()} dictionaries={dictionaries} templates={templates()} />);
  const found = cards();
  expect(found).toHaveLength(3);
  expect(within(found[0]!).getByRole('heading').textContent).toMatch(/^1\. .*cluster-single$/);
  expect(within(found[0]!).getByText('적합')).toBeTruthy();
  expect(within(found[0]!).getByText(/^LL 1 \(1–2\) ✓, LP 1 \(1–4\) ✓, PM 3 \(1–9\) ✓/)).toBeTruthy();
  expect(within(found[0]!).getByText('설명 안 되는 alias: VIRT_SCH')).toBeTruthy();
  expect(found.slice(1).map((card) => within(card).getByRole('heading').textContent?.[0])).toEqual(['2', '3']);
  expect(within(found[1]!).getByText('부적합')).toBeTruthy();
  for (const card of found) expect(within(card).getByRole('img', { name: /미리보기$/ }).querySelector('svg')).toBeTruthy();
  expect(screen.queryByText('모든 형상·배정은 assumed입니다')).toBeNull();
});

it('falls back to a Generic Layout card when no proposal fits', () => {
  const nonFitting = templates().filter(({ id }) => id !== 'cluster-single');
  render(<TemplateProposals inventory={inventory()} dictionaries={dictionaries} templates={nonFitting} />);
  const found = cards();
  const generic = found[found.length - 1]!;
  expect(within(generic).getByRole('heading').textContent).toBe('Generic Layout');
  expect(within(generic).getByText('맞는 템플릿 없음')).toBeTruthy();
  expect(within(generic).getByText('모든 형상·배정은 assumed입니다')).toBeTruthy();
  expect(within(generic).getByRole('img', { name: 'Generic Layout 미리보기' }).querySelector('svg')).toBeTruthy();
});

it('shows a message instead of throwing for an empty Inventory', () => {
  const empty = { ...inventory(), aliases: [], transfers: [] };
  render(<TemplateProposals inventory={empty} dictionaries={dictionaries} templates={templates()} />);
  expect(screen.getByText('관측된 alias가 없어 Template을 제안할 수 없습니다.')).toBeTruthy();
  expect(screen.queryAllByRole('listitem')).toHaveLength(0);
});

it('renders the host action inside each template card and the Generic Layout card', () => {
  const { rerender } = render(<TemplateProposals inventory={inventory()} dictionaries={dictionaries} templates={templates()}
    action={(choice) => <button type="button">{choice.kind === 'template' ? `시작 ${choice.templateId}` : '시작 generic'}</button>} />);
  expect(cards().map((card) => within(card).getByRole('button').textContent)).toEqual(
    cards().map((card) => `시작 ${within(card).getByRole('heading').textContent!.split(' ').at(-1)}`));
  rerender(<TemplateProposals inventory={inventory()} dictionaries={dictionaries} templates={templates().filter(({ id }) => id !== 'cluster-single')}
    action={(choice) => choice.kind === 'generic' ? <button type="button">시작 generic</button> : null} />);
  expect(within(cards().at(-1)!).getByRole('button', { name: '시작 generic' })).toBeTruthy();
});
