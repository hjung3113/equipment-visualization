import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { contained } from './errors.js';

/**
 * ADR-0015: which folders make up the Template catalog.
 * `data-root`: no repository root is known (test seam), so the data root's `templates/` is the whole catalog.
 * `bundled`: only `<repo>/assets/templates/` (the data root is inside the repo, or cannot be resolved).
 * `bundled+data-root`: the bundle plus the data root's `templates/` (data root outside the repo).
 */
export type CatalogKind = 'data-root' | 'bundled' | 'bundled+data-root';

export function createCatalog({ root, repoRoot }: { root: string; repoRoot: string | undefined }) {
  async function kind(): Promise<CatalogKind> {
    if (repoRoot === undefined) return 'data-root';
    try {
      const [rootPath, repoPath] = await Promise.all([realpath(root), realpath(repoRoot)]);
      return contained(repoPath, rootPath) ? 'bundled' : 'bundled+data-root';
    } catch {
      return 'bundled';
    }
  }
  /** The bundled catalog folder; only meaningful when `repoRoot` is known. */
  const bundledDir = (): string => join(repoRoot ?? '', 'assets/templates');
  return { kind, bundledDir };
}
