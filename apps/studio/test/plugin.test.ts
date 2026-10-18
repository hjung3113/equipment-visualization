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

async function withStudio<T>(run: (port: number) => Promise<T>): Promise<T> {
  let middleware!: Connect.NextHandleFunction;
  delete process.env.EQV_STUDIO_ASSETS;
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
  try {
    return await run(address.port);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function upload(port: number, megabytes: number, end: boolean) {
  const req = request({
    host: '127.0.0.1', port, path: '/api/import/windows?equipmentId=x', method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const response = new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
    req.on('error', reject);
    req.on('response', (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
  });
  const chunk = Buffer.alloc(1024 * 1024, ' ');
  for (let index = 0; index < megabytes; index++) req.write(chunk);
  if (end) req.end();
  return { req, response };
}

it('allows 32 MiB on /api/import/*: a chunked 33 MiB upload is 413 naming that limit', async () => {
  await withStudio(async (port) => {
    const { req, response } = upload(port, 33, false);
    try {
      const result = await response;
      expect(result.status).toBe(413);
      expect(JSON.parse(result.body)).toEqual({ error: 'Body exceeds 32 MiB' });
    } finally {
      req.destroy();
    }
  });
});

it('does not 413 a 6 MiB import body: it reaches the handler (default root is inside the repo, so 403)', async () => {
  await withStudio(async (port) => {
    const { req, response } = upload(port, 6, true);
    try {
      const result = await response;
      expect(result.status).toBe(403);
      expect(JSON.parse(result.body)).toEqual({ error: '저장소 밖 경로를 EQV_STUDIO_ASSETS로 지정하세요' });
    } finally {
      req.destroy();
    }
  });
});
