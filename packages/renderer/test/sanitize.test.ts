import { expect, it } from 'vitest';
import { sanitizePrimitive } from '../src/sanitize.js';
import { readAssets } from './compile-primitives.js';

const hostile: [string, string][] = [
  ['script', '<svg><script></script></svg>'],
  ['foreignObject', '<svg><foreignObject></foreignObject></svg>'],
  ['onload', '<svg onload="alert(1)"></svg>'],
  ['href', '<svg><rect href="https://example.test"/></svg>'],
  ['xlink:href', '<svg><rect xlink:href="https://example.test"/></svg>'],
  ['javascript:', '<svg><rect fill="javascript:alert(1)"/></svg>'],
  ['url(', '<svg><rect fill="url(#paint)"/></svg>'],
  ['style element', '<svg><style></style></svg>'],
  ['style attribute', '<svg><rect style="fill:red"/></svg>'],
  ['comment', '<svg><!-- note --></svg>'],
  ['doctype', '<!DOCTYPE svg><svg></svg>'],
  ['unknown entity', '<svg><title>&nbsp;</title></svg>'],
  ['image', '<svg><image/></svg>'],
  ['use', '<svg><use/></svg>'],
];

it.each(hostile)('rejects %s', (_name, svg) => {
  expect(() => sanitizePrimitive(svg)).toThrow();
});

it('parses all 25 primitive assets', () => {
  const assets = readAssets();
  expect(Object.keys(assets)).toHaveLength(25);
  for (const [name, svg] of Object.entries(assets)) {
    expect(sanitizePrimitive(svg).tag, name).toBe('svg');
  }
});
