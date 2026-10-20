import type { Component, LayoutDocument } from './schema.js';

type Point = { x: number; y: number };
type Matrix = { a: number; b: number; c: number; d: number; x: number; y: number };

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, x: 0, y: 0 };
const origin = (): Point => ({ x: 0, y: 0 });

const localMatrix = (transform: Component['transform']): Matrix => {
  const angle = transform.rotation * Math.PI / 180;
  const cos = Math.cos(angle) * transform.scale;
  const sin = Math.sin(angle) * transform.scale;
  return { a: cos, b: sin, c: -sin, d: cos, x: transform.x, y: transform.y };
};

const multiply = (parent: Matrix, local: Matrix): Matrix => ({
  a: parent.a * local.a + parent.c * local.b,
  b: parent.b * local.a + parent.d * local.b,
  c: parent.a * local.c + parent.c * local.d,
  d: parent.b * local.c + parent.d * local.d,
  x: parent.a * local.x + parent.c * local.y + parent.x,
  y: parent.b * local.x + parent.d * local.y + parent.y,
});

function componentWorldMatrix(layout: LayoutDocument, componentId: string): Matrix | undefined {
  const byId = new Map(layout.components.map((component) => [component.id, component]));
  let current = byId.get(componentId);
  if (!current) return undefined;

  const chain: Component[] = [];
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    chain.push(current);
    seen.add(current.id);
    current = current.parentId === undefined ? undefined : byId.get(current.parentId);
  }

  return chain.reverse().reduce((matrix, component) => multiply(matrix, localMatrix(component.transform)), IDENTITY);
}

const round3 = (value: number) => Math.round(value * 1000) / 1000 || 0;

/** Returns the Component transform origin in layout coordinates, stopping at the first repeated parent. */
export function componentWorldCenter(layout: LayoutDocument, componentId: string): Point | undefined {
  const matrix = componentWorldMatrix(layout, componentId);
  return matrix ? { x: matrix.x, y: matrix.y } : undefined;
}

/** Projects a local direction onto the footprint edge; Port positions use the Component frame before its rotation and scale. */
export function projectToFootprint(component: Component, local: Point): Point {
  const size = component.size;
  if (!size || !Number.isFinite(local.x) || !Number.isFinite(local.y)
    || !Number.isFinite(size.width) || !Number.isFinite(size.height)
    || size.width <= 0 || size.height <= 0 || (local.x === 0 && local.y === 0)) return origin();

  const xScale = local.x === 0 ? Infinity : size.width / 2 / Math.abs(local.x);
  const yScale = local.y === 0 ? Infinity : size.height / 2 / Math.abs(local.y);
  const scale = Math.min(xScale, yScale);
  return { x: round3(local.x * scale), y: round3(local.y * scale) };
}

/**
 * Places a Port where the ray from the Component's local origin toward a world target meets its footprint edge.
 * The result is in the Component local frame, with the Component centre as origin, before its own rotation and scale.
 */
export function portPositionToward(layout: LayoutDocument, componentId: string, worldTarget: Point): Point {
  const component = layout.components.find(({ id }) => id === componentId);
  if (!component?.size) return origin();

  const matrix = componentWorldMatrix(layout, componentId);
  if (!matrix) return origin();
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  const dx = worldTarget.x - matrix.x;
  const dy = worldTarget.y - matrix.y;
  if (!Number.isFinite(determinant) || determinant === 0 || !Number.isFinite(dx) || !Number.isFinite(dy)) return origin();

  return projectToFootprint(component, {
    x: (matrix.d * dx - matrix.c * dy) / determinant,
    y: (-matrix.b * dx + matrix.a * dy) / determinant,
  });
}
