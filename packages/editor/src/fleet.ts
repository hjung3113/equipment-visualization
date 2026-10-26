import {
  latestBinding,
  computeCoverage, detectDrift, type BindingsFile, type Coverage, type Drift, type EquipmentLayoutDocument, type EquipmentRecord,
  type MappingVersion, type ObservedInventory,
} from '@eqv/core';

export type FleetStatus = 'unstarted' | 'draft' | 'published' | 'drift' | 'no-observations';

/** Everything `summarizeFleet` needs for one equipment whose inputs loaded. */
export interface FleetData {
  record: EquipmentRecord;
  inventory: ObservedInventory;
  bindings: BindingsFile | null;
  /** Mapping Versions by `hash` (`sha256:<hex>`). */
  mappings: Readonly<Record<string, MappingVersion>>;
  /** Whether an alias-rules file exists at equipment scope or at the maker or model scope of this equipment. */
  hasAliasRules: boolean;
  /** The Baseline Inventory of the latest Binding's Mapping Version; `null` when none was stored (Drift is then unknown). */
  baseline: ObservedInventory | null;
  /** The latest Binding's Layout (its pinned revision, else the draft); `null` when it is not there. */
  layout: EquipmentLayoutDocument | null;
  /**
   * Why `baseline` / `layout` could not be read (unreadable or invalid file); Drift is then unknown with this reason.
   * It never fails the load: Drift inputs are optional context.
   */
  driftProblem?: string | null;
}

/** Why Drift is unknown for these inputs, or `null` when both the Baseline Inventory and the Layout are there. */
function driftUnknownReason({ baseline, layout, driftProblem }: Pick<FleetData, 'baseline' | 'layout' | 'driftProblem'>): string | null {
  if (driftProblem) return driftProblem;
  if (!baseline) return 'Baseline Inventory가 없습니다';
  if (!layout) return '최신 Binding의 Layout이 없습니다';
  return null;
}

const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

/**
 * The one Drift evaluation for the Fleet badge and the Onboarding Drift review: `drift` is `null` and `unknown` says why
 * when an input is missing or detection fails (never read as "no drift"); `drifted` is true when any Drift category has an item.
 */
export function evaluateDrift(
  data: Pick<FleetData, 'baseline' | 'layout' | 'driftProblem'>, current: ObservedInventory, mapping: MappingVersion,
): { drift: Drift | null; unknown: string | null; drifted: boolean } {
  const reason = driftUnknownReason(data);
  if (reason !== null) return { drift: null, unknown: reason, drifted: false };
  try {
    const drift = detectDrift({ baseline: data.baseline!, current, mapping, layout: data.layout! });
    return { drift, unknown: null, drifted: drift.newAliases.length > 0 || drift.newSlots.length > 0 || drift.transfersWithoutCapability.length > 0 };
  } catch (error) {
    return { drift: null, unknown: errorText(error), drifted: false };
  }
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
  /** `null` when not published, or when the Baseline Inventory or the Layout is missing: unknown, never "no drift". */
  drift: Drift | null;
  /** Why a published row's Drift is unknown (missing or invalid Drift input, or detection failed); `null` when it was checked or the row is not published. */
  driftUnknown: string | null;
  error: string | null;
}

function summarize(input: FleetData | FleetFailure | FleetNoObservations): FleetRow {
  if ('noObservations' in input) {
    const { equipmentId, maker, model } = input.record;
    return { equipmentId, maker, model, status: 'no-observations', coverage: null, assumedRatio: null, unmappedReferences: null, drift: null, driftUnknown: null, error: null };
  }
  if ('error' in input) {
    return { ...input, status: null, coverage: null, assumedRatio: null, unmappedReferences: null, drift: null, driftUnknown: null };
  }
  const { record, inventory, bindings, mappings, hasAliasRules } = input;
  const identity = { equipmentId: record.equipmentId, maker: record.maker, model: record.model };
  const failed = (error: string): FleetRow =>
    ({ ...identity, status: null, coverage: null, assumedRatio: null, unmappedReferences: null, drift: null, driftUnknown: null, error });
  if (!bindings || bindings.bindings.length === 0) {
    return { ...identity, status: hasAliasRules ? 'draft' : 'unstarted', coverage: null, assumedRatio: null,
      unmappedReferences: inventory.aliases.reduce((sum, { references }) => sum + references, 0), drift: null, driftUnknown: null, error: null };
  }
  const latest = latestBinding(bindings.bindings)!;
  const mapping = Object.hasOwn(mappings, latest.mappingHash) ? mappings[latest.mappingHash] : undefined;
  if (!mapping) return failed(`Mapping Version ${latest.mappingHash} 없음`);
  try {
    const coverage = computeCoverage(inventory, mapping);
    const { drift, unknown: driftUnknown, drifted } = evaluateDrift(input, inventory, mapping);
    return { ...identity, status: drifted ? 'drift' : 'published', coverage, assumedRatio: coverage.assumed.ratio, drift, driftUnknown, error: null,
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
