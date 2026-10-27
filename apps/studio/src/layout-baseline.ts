import { hashHex, layoutRevision, validateBindings, validateLayout, type LayoutDocument } from '@eqv/core';
import { dirOrEmpty, readFile } from './api.js';
import { layoutChanges, type LayoutChanges } from './layout-changes.js';

export const REVISION_FILE = /^([0-9a-f]{64})\.layout\.json$/;
const BINDINGS_FILE = /\.bindings\.json$/;
import { layoutDir, layoutPath } from './paths.js';

export type PublishBaseline =
  | { kind: 'identical'; hex: string }
  | { kind: 'compared'; hex: string; pinned: boolean; changes: LayoutChanges; skipped: string[] }
  | { kind: 'first'; skipped: string[] }
  | { kind: 'unpinned'; count: number; skipped: string[] };

/** The revision hexes (full 64 digits) published for `layoutId`, sorted. */
async function revisionHexes(layoutId: string): Promise<string[]> {
  return (await dirOrEmpty(layoutDir(layoutId))).flatMap((entry) => {
    const match = entry.kind === 'file' ? REVISION_FILE.exec(entry.name) : null;
    return match ? [match[1]!] : [];
  }).sort();
}

/** The revision a Binding of `layoutId` pins among `revisions`: greatest `effectiveFrom`, then greatest `layoutRevision`. */
async function pinnedRevision(layoutId: string, revisions: string[]): Promise<{ hex: string | null; skipped: string[] }> {
  const skipped: string[] = [];
  const pins: { effectiveFrom: string; layoutRevision: string }[] = [];
  const files = (await dirOrEmpty('onboarding/bindings')).filter((entry) => entry.kind === 'file' && BINDINGS_FILE.test(entry.name));
  for (const { name } of files) {
    const path = `onboarding/bindings/${name}`;
    try {
      const result = validateBindings(await readFile(path));
      if (!result.ok) { skipped.push(path); continue; }
      for (const binding of result.file.bindings) {
        if (binding.layoutId === layoutId && binding.layoutRevision !== undefined
          && revisions.includes(hashHex(binding.layoutRevision))) {
          pins.push({ effectiveFrom: binding.effectiveFrom, layoutRevision: binding.layoutRevision });
        }
      }
    } catch {
      skipped.push(path);
    }
  }
  pins.sort((a, b) => a.effectiveFrom < b.effectiveFrom ? 1 : a.effectiveFrom > b.effectiveFrom ? -1
    : a.layoutRevision < b.layoutRevision ? 1 : a.layoutRevision > b.layoutRevision ? -1 : 0);
  return { hex: pins[0] ? hashHex(pins[0].layoutRevision) : null, skipped };
}

/** What a publish of `layout` would add, against the baseline rule of #92. Throws when the baseline cannot be read or validated. */
export async function publishBaseline(layout: LayoutDocument): Promise<PublishBaseline> {
  const self = hashHex(await layoutRevision(layout));
  const revisions = await revisionHexes(layout.id);
  if (revisions.includes(self)) return { kind: 'identical', hex: self };
  const { hex: pinned, skipped } = await pinnedRevision(layout.id, revisions);
  const baseline = pinned ?? (revisions.length === 1 ? revisions[0]! : null);
  if (baseline === null) {
    return revisions.length === 0 ? { kind: 'first', skipped } : { kind: 'unpinned', count: revisions.length, skipped };
  }
  const path = layoutPath(layout.id, `sha256:${baseline}`);
  const parsed = validateLayout(await readFile(path));
  if (!parsed.ok) throw new Error(`${path}: ${parsed.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ')}`);
  return { kind: 'compared', hex: baseline, pinned: pinned !== null, changes: layoutChanges(parsed.layout, layout), skipped };
}
