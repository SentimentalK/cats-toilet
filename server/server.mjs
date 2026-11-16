#!/usr/bin/env node
// Entry point: `node server/server.mjs [--port 8787] [--db server/data/cats.db]`
// Serves the static game from the repo root and the JSON API under /api.
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createApp } from './app.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({
  options: {
    port: { type: 'string' },
    db: { type: 'string' },
    host: { type: 'string' },
  },
});

const port = Number(values.port ?? process.env.PORT ?? 8787);
const dbPath = resolve(values.db ?? process.env.DB_PATH ?? resolve(here, 'data/cats.db'));
const host = values.host ?? process.env.HOST; // default: all interfaces
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`Invalid port: ${values.port ?? process.env.PORT}`);
  process.exit(2);
}

const app = createApp({ dbPath, root: resolve(here, '..') });
const actual = await app.listen(port, host);
console.log(`cats-toilet server on http://${host || 'localhost'}:${actual}  (db: ${dbPath})`);

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: shutting down`);
  const force = setTimeout(() => process.exit(1), 5000);
  force.unref();
  try { await app.close(); } catch (e) { console.error(e); process.exitCode = 1; }
  clearTimeout(force);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
