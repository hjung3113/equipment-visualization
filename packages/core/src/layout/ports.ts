import type { Component, LayoutDocument } from './schema.js';

type Point = { x: number; y: number };
export type Matrix2D = { a: number; b: number; c: number; d: number; x: number; y: number };

const IDENTITY: Matrix2D = { a: 1, b: 0, c: 0, d: 1, x: 0, y: 0 };
const origin = (): Point => ({ x: 0, y: 0 });

export const componentLocalMatrix = (transform: Component['transform']): Matrix2D => {
  const angle = transform.rotation * Math.PI / 180;
  const cos = Math.cos(angle) * transform.scale;
  const sin = Math.sin(angle) * transform.scale;
  return { a: cos, b: sin, c: -sin, d: cos, x: transform.x, y: transform.y };
};

export const multiplyMatrix = (parent: Matrix2D, local: Matrix2D): Matrix2D => ({
  a: parent.a * local.a + parent.c * local.b,
  b: parent.b * local.a + parent.d * local.b,
  c: parent.a * local.c + parent.c * local.d,
  d: parent.b * local.c + parent.d * local.d,
  x: parent.a * local.x + parent.c * local.y + parent.x,
  y: parent.b * local.x + parent.d * local.y + parent.y,
});

export function componentWorldMatrix(layout: LayoutDocument, componentId: string): Matrix2D | undefined {
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

  return chain.reverse().reduce((matrix, component) => multiplyMatrix(matrix, componentLocalMatrix(component.transform)), IDENTITY);
}

export function invertMatrix(matrix: Matrix2D): Matrix2D | undefined {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (!Number.isFinite(determinant) || determinant === 0) return undefined;
  return {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    x: (matrix.c * matrix.y - matrix.d * matrix.x) / determinant,
    y: (matrix.b * matrix.x - matrix.a * matrix.y) / determinant,
  };
}

export const round3 = (value: number) => Math.round(value * 1000) / 1000 || 0;

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
  const inverse = invertMatrix(matrix);
  const dx = worldTarget.x - matrix.x;
  const dy = worldTarget.y - matrix.y;
  if (!inverse || !Number.isFinite(dx) || !Number.isFinite(dy)) return origin();

  return projectToFootprint(component, {
    x: inverse.a * dx + inverse.c * dy,
    y: inverse.b * dx + inverse.d * dy,
  });
}
