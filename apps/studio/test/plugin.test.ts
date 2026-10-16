import { createServer, request } from 'node:http';
import { once } from 'node:events';
import type { Connect, ViteDevServer } from 'vite';
import { expect, it } from 'vitest';
import { studioFiles } from '../server/plugin.js';

it('returns JSON 413 for a chunked over-limit body before the upload ends', async () => {
  let middleware!: Connect.NextHandleFunction;
  const plugin = studioFiles();
  if (typeof plugin.configureServer !== 'function') throw new Error('Missing middleware hook');
  Reflect.apply(plugin.configureServer, undefined, [{
    middlewares: { use: (handler: Connect.NextHandleFunction) => { middleware = handler; } },
  } as unknown as ViteDevServer]);
  const server = createServer((req, res) => middleware(req, res, () => res.end()));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server address');
  const upload = request({
    host: '127.0.0.1', port: address.port, path: '/api/layout-revisions', method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  try {
    const response = new Promise<{ status: number | undefined; type: string | undefined; body: string }>((resolve, reject) => {
      upload.on('error', reject);
      upload.on('response', (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
        res.on('error', reject);
      });
    });
    const chunk = Buffer.alloc(1024 * 1024, ' ');
    for (let index = 0; index < 6; index++) upload.write(chunk);
    const result = await response;
    expect(result.status).toBe(413);
    expect(result.type).toBe('application/json');
    expect(JSON.parse(result.body)).toEqual({ error: 'Body exceeds 5 MiB' });
  } finally {
    upload.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
