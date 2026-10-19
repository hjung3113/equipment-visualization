import { createElement, type CSSProperties, type ReactNode } from 'react';

/** Sanitized SVG element. Text nodes occur only as strings, and only inside `<title>`. */
export interface SvgNode {
  tag: string;
  attrs: Record<string, string>;
  children: (SvgNode | string)[];
}

const REACT_ATTR: Record<string, string> = {
  'stroke-width': 'strokeWidth',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'stroke-dasharray': 'strokeDasharray',
  'stroke-miterlimit': 'strokeMiterlimit',
  'stroke-dashoffset': 'strokeDashoffset',
  'stroke-opacity': 'strokeOpacity',
  'fill-opacity': 'fillOpacity',
  'vector-effect': 'vectorEffect',
  'paint-order': 'paintOrder',
  'font-family': 'fontFamily',
  'font-size': 'fontSize',
  'font-weight': 'fontWeight',
  'text-anchor': 'textAnchor',
  tabindex: 'tabIndex',
  'pointer-events': 'pointerEvents',
};

/** SVG `pointer-events` is inherited, so the layer group keeps its descendants from taking hits. */
export function withPointerEventsNone(node: SvgNode): SvgNode {
  return {
    tag: node.tag,
    attrs: { ...node.attrs, 'pointer-events': 'none' },
    children: node.children,
  };
}

/** Round derived geometry so snapshots stay stable. Layout transform numbers are not passed through this. */
export function formatNum(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`non-finite geometry: ${n}`);
  const rounded = Math.round(n * 10000) / 10000;
  if (rounded === 0) return '0';
  return String(rounded);
}

/** Preserve a layout JSON number as its shortest decimal form. */
export function formatExact(n: number): string {
  if (Object.is(n, -0)) return '0';
  return String(n);
}

export function cloneNode(node: SvgNode): SvgNode {
  return {
    tag: node.tag,
    attrs: { ...node.attrs },
    children: node.children.map((child) => (typeof child === 'string' ? child : cloneNode(child))),
  };
}

export function el(tag: string, attrs: Record<string, string> = {}, children: (SvgNode | string)[] = []): SvgNode {
  return { tag, attrs, children };
}

function reactAttr(name: string): string {
  return REACT_ATTR[name] ?? name;
}

/** Render a sanitized tree. Never uses innerHTML. */
export function renderNode(node: SvgNode | string): ReactNode {
  if (typeof node === 'string') return node;
  const props: Record<string, string | CSSProperties> = {};
  for (const [name, value] of Object.entries(node.attrs)) {
    if (name === 'style') {
      const style: Record<string, string> = {};
      for (const declaration of value.split(';')) {
        const colon = declaration.indexOf(':');
        if (colon < 0) continue;
        const property = declaration.slice(0, colon).trim().replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
        if (property) style[property] = declaration.slice(colon + 1).trim();
      }
      props.style = style;
    } else props[reactAttr(name)] = value;
  }
  const children = node.children.map((child) => renderNode(child));
  return createElement(node.tag, props, ...children);
}
