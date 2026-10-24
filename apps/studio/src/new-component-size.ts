import { round3, type LayoutDocument } from '@eqv/core';
import { PRIMITIVE_CATALOG } from '@eqv/renderer';

/** Layouts contain at least one Component; asset is a catalog primitive name. */
export function newComponentSize(layout: LayoutDocument, asset: string): { width: number; height: number } {
  const longerSides = layout.components.map((component) => {
    const primitive = component.assetRef.startsWith('primitive:')
      ? PRIMITIVE_CATALOG.find((entry) => entry.name === component.assetRef.slice('primitive:'.length)) : undefined;
    const footprint = component.size ?? primitive ?? { width: 8, height: 8 };
    return Math.max(footprint.width, footprint.height) * component.transform.scale;
  }).sort((a, b) => a - b);
  const middle = Math.floor(longerSides.length / 2);
  const median = longerSides.length % 2 ? longerSides[middle]!
    : (longerSides[middle - 1]! + longerSides[middle]!) / 2;
  const primitive = PRIMITIVE_CATALOG.find((entry) => entry.name === asset)!;
  const scale = median / Math.max(primitive.width, primitive.height);
  return { width: round3(primitive.width * scale), height: round3(primitive.height * scale) };
}
