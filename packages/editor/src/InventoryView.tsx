import { OutlineBadge } from '@fops/ui';
import { DataTable } from '@eqv/ui';
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
    <section aria-labelledby="eqv-ed-inventory-heading">
      <h2 id="eqv-ed-inventory-heading">② Inventory</h2>
      <p>표본 기간: {inventory.from} – {inventory.to}</p>
      <DataTable label="Alias 목록" columns={['alias', 'ModuleType', 'Role', 'Port/Robot', 'slots', '활동', '참조', '처음/마지막 관측']}>
        {rows.map(({ row, role }) => (
          <DataTable.Row key={row.alias}>
            <DataTable.Cell rowHeader>{row.alias}</DataTable.Cell>
            <DataTable.Cell>{row.moduleType ?? '—'}</DataTable.Cell>
            <DataTable.Cell>{role === 'unknown' ? <span className="font-semibold text-text-warning-label">{role}</span> : role}</DataTable.Cell>
            <DataTable.Cell>Port {flag(row.isPort)} · Robot {flag(row.isRobot)}</DataTable.Cell>
            <DataTable.Cell>{row.slots.length ? row.slots.join(', ') : '—'}</DataTable.Cell>
            <DataTable.Cell>
              {row.activity.length === 0 ? '—' : row.activity.map(({ kind, count }) => (
                <OutlineBadge key={kind}>{kind} {count}</OutlineBadge>
              ))}
            </DataTable.Cell>
            <DataTable.Cell><span className="tabular-nums">{row.references}</span></DataTable.Cell>
            <DataTable.Cell>{row.firstSeen ?? '—'} / {row.lastSeen ?? '—'}</DataTable.Cell>
          </DataTable.Row>
        ))}
      </DataTable>
      <h3>관측된 이송</h3>
      {inventory.transfers.length === 0 ? <p>관측된 이송 없음</p> : (
        <DataTable label="관측된 이송" columns={['from → to', '건수']}>
          {inventory.transfers.map(({ from, to, count }) => (
            <DataTable.Row key={`${from}\u0000${to}`}>
              <DataTable.Cell rowHeader>{from} → {to}</DataTable.Cell>
              <DataTable.Cell><span className="tabular-nums">{count}</span></DataTable.Cell>
            </DataTable.Row>
          ))}
        </DataTable>
      )}
    </section>
  );
}
