import type { SvgNode } from './svg.js';

const ELEMENTS = new Set(['svg', 'title', 'g', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path']);
const GEOMETRY = new Set(['x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'd', 'points']);
const EXACT = new Set(['vector-effect', 'transform', 'viewBox', 'preserveAspectRatio', 'overflow', 'role', 'xmlns', 'data-part']);
const PAINT = /^(?:none|var\(--eqv-[a-z-]+, #[0-9a-f]{6}\))$/;
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"' };

function fail(source: string, index: number, message: string): never {
  throw new Error(`${message} at ${index}: ${JSON.stringify(source.slice(index, index + 48))}`);
}

function decode(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== '&') {
      out += raw[i];
      continue;
    }
    const end = raw.indexOf(';', i);
    if (end < 0) throw new Error('unterminated entity');
    const name = raw.slice(i + 1, end);
    if (!Object.hasOwn(ENTITIES, name)) throw new Error(`unknown entity &${name};`);
    const value: string = ENTITIES[name]!;
    out += value;
    i = end;
  }
  return out;
}

function allowedAttribute(name: string): boolean {
  return GEOMETRY.has(name) || name === 'fill' || name === 'stroke' || name.startsWith('stroke-') || EXACT.has(name);
}

function validateAttribute(name: string, raw: string): string {
  if (/^on/i.test(name) || name === 'href' || name === 'xlink:href' || name === 'style') {
    throw new Error(`forbidden attribute ${name}`);
  }
  const value = decode(raw);
  const probe = `${raw}\n${value}`.toLowerCase();
  if (probe.includes('javascript:') || probe.includes('url(')) throw new Error(`forbidden value in ${name}`);
  if (!allowedAttribute(name)) throw new Error(`attribute not allowed: ${name}`);
  if ((name === 'fill' || name === 'stroke') && !PAINT.test(value)) throw new Error(`bad paint ${value}`);
  return value;
}

/**
 * Strict allowlist parser for the primitive SVG subset. No DOM.
 * Throws on comments, DOCTYPE, CDATA, processing instructions, unknown entities,
 * elements or attributes outside the allowlist, event handlers, links, style, and `javascript:` / `url(`.
 */
export function sanitizePrimitive(svgText: string): SvgNode {
  const source = svgText;
  let i = 0;

  const skipWs = () => {
    while (i < source.length && /\s/.test(source[i] ?? '')) i += 1;
  };
  const readName = () => {
    const start = i;
    if (!/[A-Za-z_:]/.test(source[i] ?? '')) fail(source, i, 'expected name');
    i += 1;
    while (i < source.length && /[\w:.-]/.test(source[i] ?? '')) i += 1;
    return source.slice(start, i);
  };

  const parseElement = (): SvgNode => {
    if (source.startsWith('<!--', i) || source.startsWith('<!', i) || source.startsWith('<?', i)) {
      fail(source, i, 'forbidden markup');
    }
    if (source[i] !== '<') fail(source, i, 'expected element');
    i += 1;
    const tag = readName();
    if (!ELEMENTS.has(tag)) fail(source, i, `forbidden element <${tag}>`);
    const attrs: Record<string, string> = {};
    for (;;) {
      skipWs();
      if (source.startsWith('/>', i)) {
        i += 2;
        return { tag, attrs, children: [] };
      }
      if (source[i] === '>') {
        i += 1;
        break;
      }
      if (i >= source.length) fail(source, i, 'unterminated start tag');
      const name = readName();
      skipWs();
      if (source[i] !== '=') fail(source, i, 'expected =');
      i += 1;
      skipWs();
      if (source[i] !== '"') fail(source, i, 'attributes must be double-quoted');
      i += 1;
      const valueStart = i;
      while (i < source.length && source[i] !== '"') {
        if (source[i] === '<') fail(source, i, '< in attribute');
        i += 1;
      }
      if (source[i] !== '"') fail(source, i, 'unterminated attribute');
      const raw = source.slice(valueStart, i);
      i += 1;
      if (Object.hasOwn(attrs, name)) fail(source, i, `duplicate attribute ${name}`);
      attrs[name] = validateAttribute(name, raw);
    }
    if (tag === 'title') {
      const start = i;
      const close = '</title>';
      const end = source.indexOf(close, i);
      if (end < 0) fail(source, i, 'unclosed title');
      const text = source.slice(start, end);
      if (text.includes('<')) fail(source, start, 'markup inside title');
      i = end + close.length;
      return { tag, attrs, children: text.length ? [decode(text)] : [] };
    }
    const children: (SvgNode | string)[] = [];
    while (i < source.length) {
      if (source.startsWith(`</${tag}>`, i)) {
        i += tag.length + 3;
        return { tag, attrs, children };
      }
      if (source.startsWith('<!--', i) || source.startsWith('<!', i) || source.startsWith('<?', i) || source.startsWith('</', i)) {
        fail(source, i, 'forbidden or mismatched markup');
      }
      if (/\s/.test(source[i] ?? '')) {
        i += 1;
        continue;
      }
      if (source[i] !== '<') fail(source, i, 'text outside title');
      children.push(parseElement());
    }
    fail(source, i, `unclosed <${tag}>`);
  };

  skipWs();
  const root = parseElement();
  skipWs();
  if (i !== source.length) fail(source, i, 'trailing content');
  if (root.tag !== 'svg') throw new Error('root must be svg');
  return root;
}
