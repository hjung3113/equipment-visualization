import type { ReactNode } from 'react';

export interface LegendItem {
  /** The consumer's swatch (for example an SVG pattern); `null` for a text-only row. */
  swatch: ReactNode;
  label: ReactNode;
}

export interface LegendProps {
  label: string;
  items: readonly LegendItem[];
}

export function Legend({ label, items }: LegendProps) {
  return (
    <ul aria-label={label} className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
      {items.map((item, index) => (
        <li key={index} className="flex items-center gap-2">
          {item.swatch}
          {item.label}
        </li>
      ))}
    </ul>
  );
}
