import type { LayoutDocument } from '@eqv/core';
import { buildScene, type SceneLayers, type SceneOptions } from './scene.js';
import { renderNode } from './svg.js';

export interface TopViewProps {
  layout: LayoutDocument;
  width: number;
  height: number;
  labels?: SceneOptions['labels'];
  layers?: Partial<SceneLayers>;
  visibleLevelIds?: readonly string[];
}

/** Static read-only Top View. `width` and `height` are CSS px from the host; there is no ResizeObserver. */
export function TopView({ layout, width, height, labels, layers, visibleLevelIds }: TopViewProps) {
  const pxPerUnit = Math.min(width / layout.viewBox.width, height / layout.viewBox.height);
  const scene = buildScene(layout, { width, height, pxPerUnit, labels, layers, visibleLevelIds });
  return renderNode(scene.node);
}
