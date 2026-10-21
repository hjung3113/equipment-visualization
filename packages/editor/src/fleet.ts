import {
  latestBinding,
  computeCoverage, type BindingsFile, type Coverage, type EquipmentRecord, type MappingVersion, type ObservedInventory,
} from '@eqv/core';

export type FleetStatus = 'unstarted' | 'draft' | 'published' | 'no-observations';

/** Everything `summarizeFleet` needs for one equipment whose inputs loaded. */
export interface FleetData {
  record: EquipmentRecord;
  inventory: ObservedInventory;
  bindings: BindingsFile | null;
  /** Mapping Versions by `hash` (`sha256:<hex>`). */
  mappings: Readonly<Record<string, MappingVersion>>;
  /** Whether an alias-rules file exists at equipment scope or at the maker or model scope of this equipment. */
  hasAliasRules: boolean;
}

/** An equipment whose inputs could not be loaded; the host supplies the reason. */
export interface FleetFailure {
  equipmentId: string;
  maker: string | null;
  model: string | null;
  error: string;
}

/** A registered equipment with no Sample Window yet: a status, not an error. */
export interface FleetNoObservations {
  record: EquipmentRecord;
  noObservations: true;
}

export interface FleetRow {
  equipmentId: string;
  maker: string | null;
  model: string | null;
  /** `null` on an error row. */
  status: FleetStatus | null;
  coverage: Coverage | null;
  assumedRatio: number | null;
  /** `null` on an error row: no number is invented for data that could not be read. */
  unmappedReferences: number | null;
  error: string | null;
}

const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

function summarize(input: FleetData | FleetFailure | FleetNoObservations): FleetRow {
  if ('noObservations' in input) {
    const { equipmentId, maker, model } = input.record;
    return { equipmentId, maker, model, status: 'no-observations', coverage: null, assumedRatio: null, unmappedReferences: null, error: null };
  }
  if ('error' in input) {
    return { ...input, status: null, coverage: null, assumedRatio: null, unmappedReferences: null };
  }
  const { record, inventory, bindings, mappings, hasAliasRules } = input;
  const identity = { equipmentId: record.equipmentId, maker: record.maker, model: record.model };
  const failed = (error: string): FleetRow =>
    ({ ...identity, status: null, coverage: null, assumedRatio: null, unmappedReferences: null, error });
  if (!bindings || bindings.bindings.length === 0) {
    return { ...identity, status: hasAliasRules ? 'draft' : 'unstarted', coverage: null, assumedRatio: null,
      unmappedReferences: inventory.aliases.reduce((sum, { references }) => sum + references, 0), error: null };
  }
  const latest = latestBinding(bindings.bindings)!;
  const mapping = Object.hasOwn(mappings, latest.mappingHash) ? mappings[latest.mappingHash] : undefined;
  if (!mapping) return failed(`Mapping Version ${latest.mappingHash} 없음`);
  try {
    const coverage = computeCoverage(inventory, mapping);
    return { ...identity, status: 'published', coverage, assumedRatio: coverage.assumed.ratio, error: null,
      unmappedReferences: coverage.unmapped.reduce((sum, { references }) => sum + references, 0) };
  } catch (error) {
    return failed(errorText(error));
  }
}

const rank = (row: FleetRow) => row.error !== null ? 0 : row.status === 'no-observations' ? 1 : 2;

/** One row per equipment: error rows, then no-observations rows, then most unmapped references first; ties by equipmentId in code-unit order. */
export function summarizeFleet(inputs: readonly (FleetData | FleetFailure | FleetNoObservations)[]): FleetRow[] {
  return inputs.map(summarize).sort((a, b) =>
    rank(a) - rank(b) ||
    (b.unmappedReferences ?? 0) - (a.unmappedReferences ?? 0) ||
    (a.equipmentId < b.equipmentId ? -1 : a.equipmentId > b.equipmentId ? 1 : 0));
}
