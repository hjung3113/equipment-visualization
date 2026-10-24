import { EmptyState, PanelSectionTitle } from '@ap/ui';
import { DataTable, OutlineBadge, Panel, StatusBadge } from '@eqv/ui';
import { TriangleAlert } from 'lucide-react';
import { compareNatural, resolveRole, type InventoryAlias, type ObservedInventory, type TypeDictionaryFile } from '@eqv/core';

export interface InventoryViewProps {
  inventory: ObservedInventory;
  dictionaries: readonly TypeDictionaryFile[];
}

// An omitted flag is absent evidence, not `false`.
const flag = (value: boolean | undefined) => value === undefined ? '—' : value ? '예' : '아니요';
const compareCode = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

export function InventoryView({ inventory, dictionaries }: InventoryViewProps) {
  const rows = inventory.aliases.map((row: InventoryAlias) => ({
    row, role: row.moduleType === undefined ? 'unknown' : resolveRole([...dictionaries], row.moduleType),
  })).sort((a, b) => Number(b.role === 'unknown') - Number(a.role === 'unknown') ||
    compareCode(a.role, b.role) || compareNatural(a.row.alias, b.row.alias));
  return (
    <Panel title="② Inventory" subtitle={`표본 기간: ${inventory.from} – ${inventory.to}`}>
      <DataTable label="Alias 목록" columns={['alias', 'ModuleType', 'Role', 'Port/Robot', 'slots', '활동', { id: 'references', header: '참조', align: 'end', className: 'whitespace-nowrap' }, '처음/마지막 관측']}>
        {rows.map(({ row, role }) => (
          <DataTable.Row key={row.alias}>
            <DataTable.Cell rowHeader>{row.alias}</DataTable.Cell>
            <DataTable.Cell>{row.moduleType ?? '—'}</DataTable.Cell>
            <DataTable.Cell>{role === 'unknown' ? <StatusBadge tone="warning" icon={TriangleAlert}>{role}</StatusBadge> : role}</DataTable.Cell>
            <DataTable.Cell className="whitespace-nowrap">Port {flag(row.isPort)} · Robot {flag(row.isRobot)}</DataTable.Cell>
            <DataTable.Cell>{row.slots.length ? row.slots.join(', ') : '—'}</DataTable.Cell>
            <DataTable.Cell>
              {row.activity.length === 0 ? '—' : (
                <span className="flex flex-wrap gap-1">
                  {row.activity.map(({ kind, count }) => <OutlineBadge key={kind}>{kind} {count}</OutlineBadge>)}
                </span>
              )}
            </DataTable.Cell>
            <DataTable.Cell numeric>{row.references}</DataTable.Cell>
            <DataTable.Cell>
              <span className="block whitespace-nowrap">{row.firstSeen ?? '—'} /</span>
              <span className="block whitespace-nowrap">{row.lastSeen ?? '—'}</span>
            </DataTable.Cell>
          </DataTable.Row>
        ))}
      </DataTable>
      <PanelSectionTitle className="mt-4 mb-2">관측된 이송</PanelSectionTitle>
      {inventory.transfers.length === 0 ? <EmptyState size="sm" title="관측된 이송 없음" /> : (
        <DataTable label="관측된 이송" columns={['from → to', { id: 'count', header: '건수', align: 'end', className: 'whitespace-nowrap' }]}>
          {inventory.transfers.map(({ from, to, count }) => (
            <DataTable.Row key={`${from}\u0000${to}`}>
              <DataTable.Cell rowHeader>{from} → {to}</DataTable.Cell>
              <DataTable.Cell numeric>{count}</DataTable.Cell>
            </DataTable.Row>
          ))}
        </DataTable>
      )}
    </Panel>
  );
}
