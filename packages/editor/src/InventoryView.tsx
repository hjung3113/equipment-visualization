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
    <section aria-labelledby="eqv-ed-inventory-heading" className="eqv-ed-section">
      <h2 id="eqv-ed-inventory-heading">② Inventory</h2>
      <p>표본 기간: {inventory.from} – {inventory.to}</p>
      <table className="eqv-ed-table" aria-label="Alias 목록">
        <thead>
          <tr>
            {['alias', 'ModuleType', 'Role', 'Port/Robot', 'slots', '활동', '참조', '처음/마지막 관측'].map((name) =>
              <th key={name} scope="col">{name}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ row, role }) => (
            <tr key={row.alias} className={role === 'unknown' ? 'eqv-ed-unknown' : undefined}>
              <th scope="row">{row.alias}</th>
              <td>{row.moduleType ?? '—'}</td>
              <td>{role}</td>
              <td>Port {flag(row.isPort)} · Robot {flag(row.isRobot)}</td>
              <td>{row.slots.length ? row.slots.join(', ') : '—'}</td>
              <td>
                {row.activity.length === 0 ? '—' : row.activity.map(({ kind, count }) => (
                  <span key={kind} className="eqv-ed-badge">{kind} {count}</span>
                ))}
              </td>
              <td className="eqv-ed-num">{row.references}</td>
              <td>{row.firstSeen ?? '—'} / {row.lastSeen ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>관측된 이송</h3>
      {inventory.transfers.length === 0 ? <p>관측된 이송 없음</p> : (
        <table className="eqv-ed-table" aria-label="관측된 이송">
          <thead>
            <tr>
              <th scope="col">from → to</th>
              <th scope="col">건수</th>
            </tr>
          </thead>
          <tbody>
            {inventory.transfers.map(({ from, to, count }) => (
              <tr key={`${from}\u0000${to}`}>
                <th scope="row">{from} → {to}</th>
                <td className="eqv-ed-num">{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
