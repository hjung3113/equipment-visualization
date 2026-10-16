import type { IncomingMessage } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { createFileApi } from './files.js';

const MAX_BODY = 5 * 1024 * 1024;

class BodyTooLarge extends Error {}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
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
      const root = process.env.EQV_STUDIO_ASSETS ?? resolve(fileURLToPath(import.meta.url), '../../../../assets');
      const api = createFileApi({ root });
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
          const body = req.method === 'GET' ? '' : await readBody(req);
          const result = await api.handle({ method: req.method ?? 'GET', url: req.url, headers, body });
          send(result.status, result.body);
        } catch (error) {
          if (error instanceof BodyTooLarge) {
            send(413, { error: 'Body exceeds 5 MiB' });
            req.resume();
          }
          else send(500, { error: 'Internal error' });
        }
      });
    },
  };
}
