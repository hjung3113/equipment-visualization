import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { idSchema, layoutDocumentSchema, layoutRevision, promoteLayout, validateLayout, type TemplateDocument } from '@eqv/core';
import type { CatalogKind, createCatalog } from './catalog.js';
import { contained, fail } from './errors.js';
import type { FileApiRequest, FileApiResponse, WriteScope } from './files.js';

const HEX = /^[0-9a-f]{64}$/;
const TEMPLATE_SUFFIX = '.template.json';
const bySource = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

interface PromoteDeps {
  root: string;
  repoRoot: string | undefined;
  catalog: ReturnType<typeof createCatalog>;
  assertEnabled(): Promise<WriteScope>;
  assertWritable(segments: string[]): Promise<void>;
  write(segments: string[], value: unknown, immutable: boolean, createOnly: boolean | undefined, scope: WriteScope):
    Promise<{ created: boolean; conflict: boolean; exists?: boolean }>;
  assertJsonType(request: FileApiRequest): void;
}

type Source = 'bundled' | 'data-root';
interface CatalogFile { source: Source; file: string; document: TemplateDocument | undefined }

export function createPromoteApi(deps: PromoteDeps) {
  /** The `*.template.json` files of one catalog folder; a missing folder is empty, escaping or unreadable files are skipped. */
  async function readFolder(dir: string, source: Source): Promise<CatalogFile[]> {
    let base: string;
    try {
      base = await realpath(dir);
    } catch {
      return [];
    }
    const files: CatalogFile[] = [];
    for (const name of (await readdir(base).catch(() => [] as string[])).filter((entry) => entry.endsWith(TEMPLATE_SUFFIX))) {
      let document: TemplateDocument | undefined;
      try {
        const real = await realpath(join(base, name));
        if (contained(base, real) && (await stat(real)).isFile()) {
          // Schema parse, as the client catalog always did: a Template whose Role counts do not fit is still listed (and shown unsuitable).
          const checked = layoutDocumentSchema.safeParse(JSON.parse(await readFile(real, 'utf8')) as unknown);
          if (checked.success && checked.data.kind === 'template') document = checked.data;
        }
      } catch {
        document = undefined;
      }
      files.push({ source, file: name, document });
    }
    return files;
  }

  async function readCatalog(kind: CatalogKind): Promise<{ bundled: CatalogFile[]; dataRoot: CatalogFile[] }> {
    if (kind === 'data-root') return { bundled: await readFolder(join(deps.root, 'templates'), 'bundled'), dataRoot: [] };
    const bundled = await readFolder(deps.catalog.bundledDir(), 'bundled');
    return { bundled, dataRoot: kind === 'bundled+data-root' ? await readFolder(join(deps.root, 'templates'), 'data-root') : [] };
  }

  async function list(): Promise<FileApiResponse> {
    const { bundled, dataRoot } = await readCatalog(await deps.catalog.kind());
    const bundledIds = new Set(bundled.flatMap(({ document }) => document ? [document.id] : []));
    const bundledFiles = new Set(bundled.map(({ file }) => file));
    const templates: { source: Source; file: string; document: TemplateDocument }[] = [];
    const skipped: string[] = [];
    const shadowed: string[] = [];
    for (const { source, file, document } of [...bundled, ...dataRoot]) {
      if (document === undefined) skipped.push(file);
      else if (source === 'data-root' && (bundledIds.has(document.id) || bundledFiles.has(file))) shadowed.push(file);
      else templates.push({ source, file, document });
    }
    return {
      status: 200,
      body: {
        templates: templates.sort((a, b) => bySource(a.document.id, b.document.id)),
        skipped: skipped.sort(bySource),
        shadowed: shadowed.sort(bySource),
      },
    };
  }

  async function readRevision(scope: WriteScope, layoutId: string, revision: string): Promise<unknown> {
    const path = `layouts/${layoutId}/${revision}.layout.json`;
    let real: string;
    try {
      real = await realpath(join(scope.base, path));
    } catch {
      return fail(404, '게시된 Layout Revision이 없습니다');
    }
    if (!contained(scope.base, real)) fail(403, 'Path escapes the assets root');
    try {
      if (!(await stat(real)).isFile()) return fail(404, '게시된 Layout Revision이 없습니다');
      return JSON.parse(await readFile(real, 'utf8')) as unknown;
    } catch (error) {
      if (error instanceof SyntaxError) return fail(422, `${path}: not valid JSON`);
      return fail(422, `${path}: unreadable`);
    }
  }

  async function promote(request: FileApiRequest): Promise<FileApiResponse> {
    deps.assertJsonType(request);
    const scope = await deps.assertEnabled();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(request.body) as Record<string, unknown>;
    } catch {
      return fail(400, 'Body is not valid JSON');
    }
    const { layoutId, revision, templateId, name } = body ?? {};
    if (typeof layoutId !== 'string' || !idSchema.safeParse(layoutId).success) return fail(400, 'layoutId must be a layout id');
    if (typeof revision !== 'string' || !HEX.test(revision)) return fail(400, 'revision must be 64 lowercase hex characters');
    if (typeof templateId !== 'string' || !idSchema.safeParse(templateId).success) return fail(400, 'templateId must be a valid id');
    if (typeof name !== 'string' || name.trim() === '') return fail(400, 'name must not be empty');

    const checked = validateLayout(await readRevision(scope, layoutId, revision));
    if (!checked.ok) return fail(422, 'Layout Revision is invalid', checked.issues);
    const { layout } = checked;
    if (layout.kind !== 'equipment-layout') return fail(422, 'Only an Equipment Layout can be promoted');
    if (layout.id !== layoutId) return fail(422, `Layout id must equal the folder name ${layoutId}`);
    const hash = await layoutRevision(layout);
    if (hash !== `sha256:${revision}`) return fail(422, 'Layout Revision hash does not match its file name');

    const { bundled, dataRoot } = await readCatalog(await deps.catalog.kind());
    const taken = '같은 id의 Template이 이미 있습니다';
    if (bundled.some(({ document, file }) => document?.id === templateId || file === `${templateId}${TEMPLATE_SUFFIX}`)) {
      return fail(409, '번들 Template과 id가 같습니다');
    }
    const template = promoteLayout(layout, { templateId, name, layoutRevision: hash });
    const result = validateLayout(template);
    if (!result.ok) return fail(422, 'Promoted Template is invalid', result.issues);
    if (dataRoot.some(({ document }) => document?.id === templateId)) return fail(409, taken);

    const segments = ['templates', `${templateId}${TEMPLATE_SUFFIX}`];
    await deps.assertWritable(segments);
    const written = await deps.write(segments, template, false, true, scope);
    if (written.exists) return fail(409, taken);
    return { status: 201, body: { path: segments.join('/'), templateId } };
  }

  return { list, promote };
}
