import { observationHash } from '../replay/replay-key.js';
import { diagnoseWallClock, type SiteWallClock } from '../site-wall-clock.js';
import { occurrenceBatchSchema, type EvidenceLevel, type OccurrenceBatch } from './schema.js';
import { batchRecordProblems } from './validate.js';

// Sample Window validation (ADR-0009, ADR-0010): collects every problem and never fixes the input. The returned batch is the input content.
export type SampleWindowRef = { from: SiteWallClock; to: SiteWallClock; hash: string; timeDomain: string };
export type ImportRejectCode = 'schema' | 'fraction-too-long' | 'fraction-missing' | 'offset' | 'malformed-time' | 'empty-range'
  | 'empty-time-domain' | 'continuation' | 'equipment-mismatch' | 'record-owner' | 'duplicate-seq' | 'duplicate-id'
  | 'generation-mismatch' | 'outside-window' | 'window-overlap' | 'time-domain-mismatch';
export type ImportWarningCode = 'illustrative-in-source' | 'no-occurrences' | 'dqi-outside-window';
export type ImportIssue<C extends string = ImportRejectCode | ImportWarningCode> = { code: C; path: (string | number)[]; message: string };
export type SampleWindowSummary = {
  from: SiteWallClock; to: SiteWallClock; timeDomain: string; dataGeneration: string; parserContractVersion: string;
  watermark: { seq: number; at: SiteWallClock };
  occurrences: number; openOccurrences: number;
  dataQualityIssues: number; dataQualityIssuesByType: Record<string, number>;
  boundaryEvidence: Record<EvidenceLevel, number>;
  identityEvidence: Record<EvidenceLevel, number>;
  nullBoundaryTimes: number;
  aliases: number;
  seq: { min: number; max: number } | null;
  name: string; hash: string;
};
export type SampleWindowResult =
  | { ok: true; batch: OccurrenceBatch; summary: SampleWindowSummary; warnings: ImportIssue<ImportWarningCode>[] }
  | { ok: false; issues: ImportIssue<ImportRejectCode>[]; warnings: ImportIssue<ImportWarningCode>[];
      summary?: Omit<SampleWindowSummary, 'name' | 'hash'> };

type Path = (string | number)[];
const NAME_PART = '\\d{8}T\\d{6}\\.\\d{3}';
const NAME = new RegExp(`^(${NAME_PART})_(${NAME_PART})_([0-9a-f]{64})$`);
const compact = (t: SiteWallClock) => t.replace(/[-:]/g, '');
const expand = (c: string): SiteWallClock => `${c.slice(0, 4)}-${c.slice(4, 6)}-${c.slice(6, 8)}T${c.slice(9, 11)}:${c.slice(11, 13)}:${c.slice(13, 15)}.${c.slice(16)}`;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const evidenceCounts = (): Record<EvidenceLevel, number> => ({ observed: 0, derived: 0, illustrative: 0, unknown: 0 });

// Stage 1 time diagnosis: every string time field of a raw (possibly hostile) input.
function timeFields(raw: unknown): { path: Path; value: string }[] {
  const found: { path: Path; value: string }[] = [];
  if (!isRecord(raw)) return found;
  const take = (parent: unknown, key: string, path: Path) => {
    if (isRecord(parent) && typeof parent[key] === 'string') found.push({ path: [...path, key], value: parent[key] });
  };
  take(raw, 'from', []);
  take(raw, 'to', []);
  take(raw.watermark, 'at', ['watermark']);
  if (Array.isArray(raw.occurrences)) {
    raw.occurrences.forEach((occurrence: unknown, i) => {
      if (!isRecord(occurrence)) return;
      take(occurrence.start, 'at', ['occurrences', i, 'start']);
      take(occurrence.end, 'at', ['occurrences', i, 'end']);
    });
  }
  if (Array.isArray(raw.issues)) raw.issues.forEach((issue: unknown, i) => take(issue, 'at', ['issues', i]));
  return found;
}

const TIME_CODE = { 'fraction-too-long': 'fraction-too-long', 'fraction-missing': 'fraction-missing', offset: 'offset', malformed: 'malformed-time' } as const;

function stage1(raw: unknown): ImportIssue<ImportRejectCode>[] {
  const issues: ImportIssue<ImportRejectCode>[] = [];
  const diagnosed = new Set<string>();
  for (const { path, value } of timeFields(raw)) {
    const diagnosis = diagnoseWallClock(value);
    if (diagnosis.ok) continue;
    diagnosed.add(JSON.stringify(path));
    issues.push({ code: TIME_CODE[diagnosis.reason], path, message: `${path.join('.')} is not a Site Wall-clock (${diagnosis.reason}): ${JSON.stringify(value)}` });
  }
  const parsed = occurrenceBatchSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.map((part) => typeof part === 'number' ? part : String(part));
      if (diagnosed.has(JSON.stringify(path))) continue;
      issues.push({ code: 'schema', path, message: issue.message });
    }
  }
  return issues;
}

function summarize(batch: OccurrenceBatch): Omit<SampleWindowSummary, 'name' | 'hash'> {
  const boundaryEvidence = evidenceCounts();
  const identityEvidence = evidenceCounts();
  const aliases = new Set<string>();
  const byType = new Map<string, number>();
  const seqs: number[] = [];
  let openOccurrences = 0;
  let nullBoundaryTimes = 0;
  for (const occurrence of batch.occurrences) {
    if (!occurrence.end) openOccurrences++;
    for (const boundary of [occurrence.start, occurrence.end]) {
      if (!boundary) continue;
      boundaryEvidence[boundary.evidence]++;
      if (boundary.at === null) nullBoundaryTimes++;
      seqs.push(boundary.seq);
    }
    if (occurrence.material) identityEvidence[occurrence.material.identityEvidence]++;
    for (const ref of [occurrence.location, occurrence.from, occurrence.to]) if (ref) aliases.add(ref.moduleAlias);
  }
  for (const issue of batch.issues) {
    byType.set(issue.issueType, (byType.get(issue.issueType) ?? 0) + 1);
    seqs.push(issue.seq);
  }
  return {
    from: batch.from, to: batch.to, timeDomain: batch.timeDomain, dataGeneration: batch.dataGeneration,
    parserContractVersion: batch.parserContractVersion, watermark: { ...batch.watermark },
    occurrences: batch.occurrences.length, openOccurrences, dataQualityIssues: batch.issues.length,
    dataQualityIssuesByType: Object.fromEntries([...byType].sort(([a], [b]) => compare(a, b))),
    boundaryEvidence, identityEvidence, nullBoundaryTimes, aliases: aliases.size,
    seq: seqs.length ? { min: seqs.reduce((a, b) => Math.min(a, b)), max: seqs.reduce((a, b) => Math.max(a, b)) } : null,
  };
}

function warningsOf(batch: OccurrenceBatch): ImportIssue<ImportWarningCode>[] {
  const warnings: ImportIssue<ImportWarningCode>[] = [];
  const illustrative = (path: Path) => warnings.push({ code: 'illustrative-in-source', path, message: `${path.join('.')} is illustrative evidence in source data; it is counted as illustrative, not remapped` });
  for (const [i, occurrence] of batch.occurrences.entries()) {
    if (occurrence.start.evidence === 'illustrative') illustrative(['occurrences', i, 'start', 'evidence']);
    if (occurrence.end?.evidence === 'illustrative') illustrative(['occurrences', i, 'end', 'evidence']);
    if (occurrence.material?.identityEvidence === 'illustrative') illustrative(['occurrences', i, 'material', 'identityEvidence']);
  }
  const ids = new Set(batch.occurrences.map((occurrence) => occurrence.id));
  for (const [i, issue] of batch.issues.entries()) {
    if (issue.relatedOccurrenceId !== undefined && !ids.has(issue.relatedOccurrenceId)) {
      warnings.push({ code: 'dqi-outside-window', path: ['issues', i, 'relatedOccurrenceId'],
        message: `issues[${i}] (${issue.id}) relates to Occurrence ${issue.relatedOccurrenceId}, which is not in this batch` });
    }
  }
  if (batch.occurrences.length === 0) warnings.push({ code: 'no-occurrences', path: ['occurrences'], message: 'The batch has no Occurrences' });
  return warnings;
}

export async function validateSampleWindow(raw: unknown, ctx: { equipmentId: string; existing: SampleWindowRef[] }): Promise<SampleWindowResult> {
  const shape = stage1(raw);
  if (shape.length > 0) return { ok: false, issues: shape, warnings: [] };
  const batch = occurrenceBatchSchema.parse(raw);
  const issues: ImportIssue<ImportRejectCode>[] = [];
  const reject = (code: ImportRejectCode, path: Path, message: string) => issues.push({ code, path, message });

  const emptyRange = batch.from >= batch.to;
  if (emptyRange) reject('empty-range', ['to'], `Sample Window must satisfy from < to (from ${batch.from}, to ${batch.to})`);
  if (batch.timeDomain === '') reject('empty-time-domain', ['timeDomain'], 'timeDomain must not be empty');
  if (batch.continuationToken !== undefined) reject('continuation', ['continuationToken'], 'continuationToken is set: import needs the complete OccurrenceBatch');
  if (batch.equipmentId !== ctx.equipmentId) reject('equipment-mismatch', ['equipmentId'], `batch.equipmentId (${batch.equipmentId}) must match the target equipment (${ctx.equipmentId})`);
  const problems = batchRecordProblems(batch);
  for (const problem of problems) reject(problem.code, problem.path, problem.message);
  for (const [i, occurrence] of batch.occurrences.entries()) {
    for (const field of ['dataGeneration', 'parserContractVersion'] as const) {
      if (occurrence.source[field] !== batch[field]) {
        reject('generation-mismatch', ['occurrences', i, 'source', field],
          `occurrences[${i}].source.${field} (${occurrence.source[field]}) must match batch.${field} (${batch[field]})`);
      }
    }
  }
  if (!emptyRange) {
    // Only provable cases: open, null-time and inverted (Time Anomaly) Occurrences are never judged.
    for (const [i, { id, start, end }] of batch.occurrences.entries()) {
      if (start.at === null || end?.at == null || start.at > end.at) continue;
      if (end.at < batch.from || start.at >= batch.to) {
        reject('outside-window', ['occurrences', i], `occurrences[${i}] (${id}) [${start.at}, ${end.at}] lies outside [${batch.from}, ${batch.to})`);
      }
    }
  }
  // A hash is defined only for a batch without duplicate ids: with them, array order would decide it.
  const hash = problems.some((problem) => problem.code === 'duplicate-id') ? null : await observationHash(batch);
  for (const ref of ctx.existing) {
    if (ref.timeDomain !== batch.timeDomain) {
      reject('time-domain-mismatch', ['timeDomain'], `timeDomain ${JSON.stringify(batch.timeDomain)} differs from existing window [${ref.from}, ${ref.to}) (${JSON.stringify(ref.timeDomain)})`);
    }
  }
  if (!emptyRange) {
    for (const ref of ctx.existing) {
      if (hash !== null && ref.hash === hash) continue;
      if (ref.from < batch.to && batch.from < ref.to) reject('window-overlap', ['from'], `[${batch.from}, ${batch.to}) overlaps existing window [${ref.from}, ${ref.to})`);
    }
  }
  const warnings = warningsOf(batch);
  const summary = summarize(batch);
  if (issues.length > 0 || hash === null) return { ok: false, issues, warnings, summary };
  return { ok: true, batch, warnings, summary: { ...summary, hash, name: await sampleWindowName(batch) } };
}

export async function sampleWindowName(batch: OccurrenceBatch): Promise<string> {
  return `${compact(batch.from)}_${compact(batch.to)}_${(await observationHash(batch)).slice('sha256:'.length)}`;
}

export function parseSampleWindowName(name: string): { from: SiteWallClock; to: SiteWallClock; hash: string } | null {
  const match = NAME.exec(name);
  if (!match) return null;
  const from = expand(match[1]!);
  const to = expand(match[2]!);
  return from < to ? { from, to, hash: `sha256:${match[3]!}` } : null;
}
