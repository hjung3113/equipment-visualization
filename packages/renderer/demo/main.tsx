import { layoutDocumentSchema, type LayoutDocument } from '@eqv/core';
import { useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TopView } from '../src/index.js';

const ORDER = [
  'cluster-single', 'cluster-dual-hub', 'wet-linear', 'track-stacked',
  'lithography-dual-stage', 'vertical-batch-furnace',
] as const;

const files = import.meta.glob('../../../assets/templates/*.template.json', { eager: true, import: 'default' }) as Record<string, unknown>;

const templates = ORDER.map((id) => {
  const entry = Object.entries(files).find(([path]) => path.endsWith(`/${id}.template.json`));
  if (!entry) throw new Error(`missing template ${id}`);
  return layoutDocumentSchema.parse(entry[1]);
});

function suffix(id: string, tile: number): string {
  return `${id}-t${tile}`;
}

/** Tile cluster-dual-hub until the layout has at least `count` components. */
function stressLayout(count: number): LayoutDocument {
  const base = templates.find((template) => template.id === 'cluster-dual-hub');
  if (!base) throw new Error('missing cluster-dual-hub');
  const tiles = Math.max(1, Math.ceil(count / base.components.length));
  const cols = Math.ceil(Math.sqrt(tiles));
  const rows = Math.ceil(tiles / cols);
  const components: LayoutDocument['components'] = [];
  const physicalInterfaces: LayoutDocument['physicalInterfaces'] = [];
  const transferCapabilities: LayoutDocument['transferCapabilities'] = [];
  const processRoutes: LayoutDocument['processRoutes'] = [];
  for (let tile = 0; tile < tiles; tile += 1) {
    const dx = (tile % cols) * base.viewBox.width;
    const dy = Math.floor(tile / cols) * base.viewBox.height;
    const idOf = (id: string) => suffix(id, tile);
    for (const component of base.components) {
      components.push({
        ...component,
        id: idOf(component.id),
        parentId: component.parentId ? idOf(component.parentId) : undefined,
        transform: component.parentId
          ? component.transform
          : { ...component.transform, x: component.transform.x + dx, y: component.transform.y + dy },
      });
    }
    for (const edge of base.physicalInterfaces) {
      physicalInterfaces.push({
        ...edge,
        id: idOf(edge.id),
        a: { ...edge.a, componentId: idOf(edge.a.componentId) },
        b: { ...edge.b, componentId: idOf(edge.b.componentId) },
      });
    }
    for (const edge of base.transferCapabilities) {
      transferCapabilities.push({
        ...edge,
        id: idOf(edge.id),
        handlerComponentId: idOf(edge.handlerComponentId),
        a: { ...edge.a, componentId: idOf(edge.a.componentId) },
        b: { ...edge.b, componentId: idOf(edge.b.componentId) },
      });
    }
    for (const route of base.processRoutes) {
      processRoutes.push({ ...route, id: idOf(route.id), steps: route.steps.map(idOf) });
    }
  }
  // `outside` labels and annotation chips extend past the components, so leave a margin on every side.
  const margin = 48;
  return {
    ...base,
    id: `${base.id}-stress`,
    name: `${base.name} × ${tiles}`,
    viewBox: {
      x: base.viewBox.x - margin,
      y: base.viewBox.y - margin,
      width: base.viewBox.width * cols + margin * 2,
      height: base.viewBox.height * rows + margin * 2,
    },
    components,
    physicalInterfaces,
    transferCapabilities,
    processRoutes,
  };
}

const stressN = Number(new URLSearchParams(window.location.search).get('stress') ?? '');
const stress = Number.isFinite(stressN) && stressN > 0 ? Math.floor(stressN) : 0;

function App() {
  const [templateId, setTemplateId] = useState<(typeof ORDER)[number]>('cluster-single');
  const [labels, setLabels] = useState<'label' | 'id' | 'none'>('label');
  const [interfaces, setInterfaces] = useState(true);
  const [certainty, setCertainty] = useState(false);
  const [holdingSites, setHoldingSites] = useState(false);
  const [capabilities, setCapabilities] = useState(false);
  const [upper, setUpper] = useState(true);

  useLayoutEffect(() => {
    performance.mark('eqv-render-end');
    performance.measure('eqv-render', 'eqv-render-start', 'eqv-render-end');
    const measure = performance.getEntriesByName('eqv-render').at(-1);
    const output = document.getElementById('eqv-perf');
    if (output && measure) output.textContent = `${Math.round(measure.duration * 100) / 100} ms`;
  }, []);

  const selected = templates.find((template) => template.id === templateId) ?? templates[0];
  if (!selected) return null;
  const layout = stress > 0 ? stressLayout(stress) : selected;
  const visibleLevelIds = upper ? undefined : layout.levels.filter((level) => level.id !== 'level-upper').map((level) => level.id);
  const stageW = 960;
  const stageH = Math.max(1, Math.round(stageW * (layout.viewBox.height / layout.viewBox.width)));

  return (
    <>
      <header>
        {stress > 0 ? <strong>stress {stress} ({layout.components.length} components)</strong> : ORDER.map((id) => (
          <button key={id} type="button" aria-pressed={id === templateId} onClick={() => setTemplateId(id)}>{id}</button>
        ))}
        <label>labels
          <select value={labels} onChange={(event) => setLabels(event.target.value as 'label' | 'id' | 'none')}>
            <option value="label">label</option>
            <option value="id">id</option>
            <option value="none">none</option>
          </select>
        </label>
        <label><input type="checkbox" checked={interfaces} onChange={(event) => setInterfaces(event.target.checked)} />interfaces</label>
        <label><input type="checkbox" checked={capabilities} onChange={(event) => setCapabilities(event.target.checked)} />capabilities</label>
        <label><input type="checkbox" checked={certainty} onChange={(event) => setCertainty(event.target.checked)} />certainty</label>
        <label><input type="checkbox" checked={holdingSites} onChange={(event) => setHoldingSites(event.target.checked)} />holding sites</label>
        <label><input type="checkbox" checked={upper} onChange={(event) => setUpper(event.target.checked)} />level-upper</label>
      </header>
      <div id="stage">
        <TopView
          layout={layout}
          width={stageW}
          height={stageH}
          labels={labels}
          layers={{ interfaces, capabilities, certainty, holdingSites }}
          visibleLevelIds={visibleLevelIds}
        />
      </div>
    </>
  );
}

performance.mark('eqv-render-start');
const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
