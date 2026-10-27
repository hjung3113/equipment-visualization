import { layoutDocumentSchema, type Component, type LayoutDocument, type Provenance } from './schema.js';

export type LayoutIssueCode =
  | 'schema' | 'duplicate-id' | 'unknown-reference' | 'unknown-level' | 'hierarchy-cycle'
  | 'handler-not-robot' | 'self-loop' | 'verified-without-evidence' | 'role-cardinality'
  | 'site-position-outside-footprint';
export interface LayoutIssue { code: LayoutIssueCode; path: (string | number)[]; message: string }
export type LayoutValidationResult =
  | { ok: true; layout: LayoutDocument; issues: [] }
  | { ok: false; issues: LayoutIssue[] };

type Path = LayoutIssue['path'];

// Choose the earliest cycle member in document order, regardless of where a chain enters it.
function hierarchyCycles(components: Component[], byId: Map<string, Component>): Set<Component> {
  const finished = new Set<Component>();
  const representatives = new Set<Component>();
  const order = new Map(components.map((component, index) => [component, index]));
  for (const start of components) {
    const chain: Component[] = [];
    const positions = new Map<Component, number>();
    let current: Component | undefined = start;
    while (current && !finished.has(current)) {
      const position = positions.get(current);
      if (position !== undefined) {
        const cycle = chain.slice(position);
        const first = cycle.reduce((a, b) => order.get(a)! < order.get(b)! ? a : b);
        representatives.add(first);
        break;
      }
      positions.set(current, chain.length);
      chain.push(current);
      current = current.parentId === undefined ? undefined : byId.get(current.parentId);
    }
    chain.forEach((component) => finished.add(component));
  }
  return representatives;
}

export function validateLayout(input: unknown): LayoutValidationResult {
  const parsed = layoutDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        code: 'schema', path: issue.path.map((part) => typeof part === 'number' ? part : String(part)),
        message: issue.message,
      })),
    };
  }
  const layout = parsed.data;
  const issues: LayoutIssue[] = [];
  const add = (code: LayoutIssueCode, path: Path, message: string) => { issues.push({ code, path, message }); };
  const duplicate = (seen: Set<string>, id: string, path: Path) => {
    if (seen.has(id)) add('duplicate-id', path, `Duplicate ID: ${id}`);
    seen.add(id);
  };
  const sources = new Set(layout.sources.map((source) => source.id));
  const levels = new Set(layout.levels.map((level) => level.id));
  const components = new Map<string, Component>();
  for (const component of layout.components) {
    if (!components.has(component.id)) components.set(component.id, component);
  }
  const cycles = hierarchyCycles(layout.components, components);
  const provenance = (value: Provenance, path: Path) => {
    if (value.certainty === 'verified' && value.sourceEvidence.length === 0) {
      add('verified-without-evidence', [...path, 'sourceEvidence'], 'Verified provenance requires source evidence');
    }
    value.sourceEvidence.forEach((id, index) => {
      if (!sources.has(id)) add('unknown-reference', [...path, 'sourceEvidence', index], `Unknown source evidence: ${id}`);
    });
  };
  const componentReference = (id: string, path: Path): Component | undefined => {
    const component = components.get(id);
    if (!component) add('unknown-reference', path, `Unknown Component: ${id}`);
    return component;
  };
  const endpoint = (componentId: string, localId: string, field: 'portId' | 'holdingSiteId', path: Path) => {
    const component = componentReference(componentId, [...path, 'componentId']);
    if (!component) return;
    const places = field === 'portId' ? component.ports : component.holdingSites;
    if (!places.some((place) => place.id === localId)) {
      add('unknown-reference', [...path, field], `Unknown ${field} ${localId} in Component ${componentId}`);
    }
  };
  const sourceIds = new Set<string>();
  layout.sources.forEach((source, index) => duplicate(sourceIds, source.id, ['sources', index, 'id']));
  const levelIds = new Set<string>();
  layout.levels.forEach((level, index) => duplicate(levelIds, level.id, ['levels', index, 'id']));
  const componentIds = new Set<string>();
  layout.components.forEach((component, index) => {
    const path: Path = ['components', index];
    duplicate(componentIds, component.id, [...path, 'id']);
    if (component.parentId !== undefined) componentReference(component.parentId, [...path, 'parentId']);
    if (cycles.has(component)) add('hierarchy-cycle', [...path, 'parentId'], `Parent hierarchy cycle containing ${component.id}`);
    if (!levels.has(component.levelId)) add('unknown-level', [...path, 'levelId'], `Unknown Level: ${component.levelId}`);
    const portIds = new Set<string>();
    component.ports.forEach((port, portIndex) => {
      const portPath = [...path, 'ports', portIndex];
      duplicate(portIds, port.id, [...portPath, 'id']);
      provenance(port.provenance, [...portPath, 'provenance']);
    });
    const siteIds = new Set<string>();
    component.holdingSites.forEach((site, siteIndex) => {
      const sitePath = [...path, 'holdingSites', siteIndex];
      duplicate(siteIds, site.id, [...sitePath, 'id']);
      provenance(site.provenance, [...sitePath, 'provenance']);
      if (site.position && component.size
        && (Math.abs(site.position.x) > component.size.width / 2 || Math.abs(site.position.y) > component.size.height / 2)) {
        add('site-position-outside-footprint', [...sitePath, 'position'], `Holding Site ${site.id} position lies outside the ${component.id} footprint`);
      }
    });
    const properties = ['role', 'assetRef', 'label', 'parentId', 'levelId', 'transform', 'size'] as const;
    for (const property of properties) {
      const value = component.provenance[property];
      if (value) provenance(value, [...path, 'provenance', property]);
    }
  });
  const physicalIds = new Set<string>();
  layout.physicalInterfaces.forEach((edge, index) => {
    const path: Path = ['physicalInterfaces', index];
    duplicate(physicalIds, edge.id, [...path, 'id']);
    endpoint(edge.a.componentId, edge.a.portId, 'portId', [...path, 'a']);
    endpoint(edge.b.componentId, edge.b.portId, 'portId', [...path, 'b']);
    if (edge.a.componentId === edge.b.componentId && edge.a.portId === edge.b.portId) {
      add('self-loop', [...path, 'b'], 'Physical Interface endpoints must differ');
    }
    provenance(edge.provenance, [...path, 'provenance']);
  });
  const transferIds = new Set<string>();
  layout.transferCapabilities.forEach((edge, index) => {
    const path: Path = ['transferCapabilities', index];
    duplicate(transferIds, edge.id, [...path, 'id']);
    endpoint(edge.a.componentId, edge.a.holdingSiteId, 'holdingSiteId', [...path, 'a']);
    endpoint(edge.b.componentId, edge.b.holdingSiteId, 'holdingSiteId', [...path, 'b']);
    if (edge.a.componentId === edge.b.componentId && edge.a.holdingSiteId === edge.b.holdingSiteId) {
      add('self-loop', [...path, 'b'], 'Transfer Capability endpoints must differ');
    }
    const handler = componentReference(edge.handlerComponentId, [...path, 'handlerComponentId']);
    if (handler && handler.role !== 'robot') {
      add('handler-not-robot', [...path, 'handlerComponentId'], `Handler ${handler.id} must have role robot`);
    }
    provenance(edge.provenance, [...path, 'provenance']);
  });
  const routeIds = new Set<string>();
  layout.processRoutes.forEach((route, index) => {
    const path: Path = ['processRoutes', index];
    duplicate(routeIds, route.id, [...path, 'id']);
    route.steps.forEach((id, stepIndex) => componentReference(id, [...path, 'steps', stepIndex]));
  });
  if (layout.kind === 'template') {
    const counts = new Map<string, number>();
    layout.components.forEach(({ role }) => counts.set(role, (counts.get(role) ?? 0) + 1));
    for (const [role, { min, max }] of Object.entries(layout.roleCardinality)) {
      const count = counts.get(role) ?? 0;
      if (count < min || count > max) {
        add('role-cardinality', ['roleCardinality', role], `Role ${role} has ${count} Components; expected ${min}–${max}`);
      }
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, layout, issues: [] };
}
