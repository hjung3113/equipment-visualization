import type { Component, MaterialKind, Provenance, TemplateDocument } from '../../src/index';

const assumed = (): Provenance => ({ certainty: 'assumed', sourceEvidence: [] });

function component(
  id: string,
  role: string,
  x: number,
  ports: string[],
  sites: [string, MaterialKind][],
  parentId?: string,
): Component {
  return {
    id, role, assetRef: `synthetic-${role}`, label: id, levelId: 'level-main',
    ...(parentId === undefined ? {} : { parentId }),
    transform: { x, y: 0, rotation: 0, scale: 1 },
    ports: ports.map((id) => ({ id, position: { x: 0, y: 0 }, provenance: assumed() })),
    holdingSites: sites.map(([id, kind]) => ({ id, materialKinds: [kind], provenance: assumed() })),
    provenance: { transform: assumed() },
  };
}

export function clusterTemplate(): TemplateDocument {
  return {
    schemaVersion: '0.4', kind: 'template', id: 'cluster-single', name: 'Synthetic single-hub cluster',
    unit: 'abstract', viewBox: { x: 0, y: 0, width: 100, height: 100 },
    sources: [{ id: 'src-synthetic', title: 'Synthetic test fixture', license: 'synthetic' }],
    levels: [{ id: 'level-main', label: 'Main', order: 0 }],
    components: [
      component('lp-a', 'lp', 0, ['efem'], [['carrier', 'carrier'], ['slot-01', 'wafer'], ['slot-02', 'wafer']]),
      component('efem-1', 'efem', 10, ['lp', 'll'], []),
      component('efem-robot', 'robot', 0, [], [['blade-a', 'wafer']], 'efem-1'),
      component('ll-a', 'll', 20, ['efem', 'tm'], [['slot-1', 'wafer'], ['slot-2', 'wafer']]),
      component('tm-1', 'tm', 30, ['ll', 'pm-a', 'pm-b'], []),
      component('tm-robot', 'robot', 0, [], [['blade-a', 'wafer'], ['blade-b', 'wafer']], 'tm-1'),
      component('pm-a', 'pm', 40, ['tm'], [['station-1', 'wafer']]),
      component('pm-b', 'pm', 50, ['tm'], [['station-1', 'wafer']]),
    ],
    physicalInterfaces: [
      { id: 'lp-efem', kind: 'docking', a: { componentId: 'lp-a', portId: 'efem' }, b: { componentId: 'efem-1', portId: 'lp' }, provenance: { certainty: 'verified', sourceEvidence: ['src-synthetic'] } },
      { id: 'efem-ll', kind: 'gate', a: { componentId: 'efem-1', portId: 'll' }, b: { componentId: 'll-a', portId: 'efem' }, provenance: assumed() },
      { id: 'll-tm', kind: 'gate', a: { componentId: 'll-a', portId: 'tm' }, b: { componentId: 'tm-1', portId: 'll' }, provenance: assumed() },
      { id: 'tm-pm-a', kind: 'gate', a: { componentId: 'tm-1', portId: 'pm-a' }, b: { componentId: 'pm-a', portId: 'tm' }, provenance: assumed() },
      { id: 'tm-pm-b', kind: 'gate', a: { componentId: 'tm-1', portId: 'pm-b' }, b: { componentId: 'pm-b', portId: 'tm' }, provenance: assumed() },
    ],
    transferCapabilities: [
      { id: 'lp-ll', a: { componentId: 'lp-a', holdingSiteId: 'slot-01' }, b: { componentId: 'll-a', holdingSiteId: 'slot-1' }, handlerComponentId: 'efem-robot', provenance: assumed() },
      { id: 'll-pm-a', a: { componentId: 'll-a', holdingSiteId: 'slot-1' }, b: { componentId: 'pm-a', holdingSiteId: 'station-1' }, handlerComponentId: 'tm-robot', provenance: assumed() },
      { id: 'll-pm-b', a: { componentId: 'll-a', holdingSiteId: 'slot-2' }, b: { componentId: 'pm-b', holdingSiteId: 'station-1' }, handlerComponentId: 'tm-robot', provenance: assumed() },
    ],
    processRoutes: [{ id: 'main-route', label: 'Representative flow', steps: ['lp-a', 'll-a', 'pm-a'] }],
    roleCardinality: { pm: { min: 2, max: 6 } },
  };
}
