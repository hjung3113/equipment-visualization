import type { IncomingMessage } from 'node:http';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { createFileApi } from './files.js';

const MiB = 1024 * 1024;
const MAX_BODY = 5 * MiB;
const MAX_IMPORT_BODY = 32 * MiB;

class BodyTooLarge extends Error {}

const bodyLimit = (url: string): number =>
  new URL(url, 'http://studio.local').pathname.startsWith('/api/import/') ? MAX_IMPORT_BODY : MAX_BODY;

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        chunks.length = 0;
        req.pause();
        req.off('data', onData);
        reject(new BodyTooLarge());
        return;
      }
      chunks.push(chunk);
    };
    req.on('data', onData);
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Dev-only file API for the Studio; `apply: 'serve'` keeps it out of `vite build`. No auth (ONBOARDING §8). */
export function studioFiles(): Plugin {
  return {
    name: 'eqv-studio-files',
    apply: 'serve',
    configureServer(server) {
      const repoRoot = resolve(fileURLToPath(import.meta.url), '../../../..');
      const root = process.env.EQV_STUDIO_ASSETS ?? join(repoRoot, 'assets');
      const api = createFileApi({ root, repoRoot });
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          next();
          return;
        }
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        try {
          const headers: Record<string, string | undefined> = {};
          for (const [name, value] of Object.entries(req.headers)) headers[name] = Array.isArray(value) ? value.join(', ') : value;
          const body = req.method === 'GET' ? '' : await readBody(req, bodyLimit(req.url));
          const result = await api.handle({ method: req.method ?? 'GET', url: req.url, headers, body });
          send(result.status, result.body);
        } catch (error) {
          if (error instanceof BodyTooLarge) {
            send(413, { error: `Body exceeds ${bodyLimit(req.url ?? '') / MiB} MiB` });
            req.resume();
          }
          else send(500, { error: 'Internal error' });
        }
      });
    },
  };
}
