import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';
import { startServer } from './serve.mjs';
import { GAME_READY } from './seed.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const RUNTIME_DIR = '/home/sentimentalk/codes/temp/cat-002/e2e';
const DEFAULT_SHOT_DIR = '/home/sentimentalk/codes/temp/cat-002/screenshots';

export async function withGame(t, fn, opts = {}) {
  const port = opts.port ?? Number(process.env.E2E_PORT ?? 8790);
  const cdpPort = opts.cdpPort ?? 9555;
  const shotDir = process.env.E2E_SHOT_DIR ?? DEFAULT_SHOT_DIR;

  await mkdir(RUNTIME_DIR, { recursive: true });
  await mkdir(shotDir, { recursive: true });
  const runDir = await mkdtemp(path.join(RUNTIME_DIR, 'run-'));
  const dbPath = path.join(runDir, 'cats.db');
  const userDataDir = path.join(runDir, 'profile');

  let server = null;
  let page = null;

  t.after(async () => {
    const errors = page?.errors ?? null;
    if (page) {
      try {
        await page.close();
      } catch (e) {
        console.error('[e2e] page close failed:', e);
      }
    }
    if (server) {
      try {
        await server.stop();
      } catch (e) {
        console.error('[e2e] server stop failed:', e);
      }
    }
    await rm(runDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
    if (errors) console.log(`[e2e] console errors: ${errors.length}`);
  });

  let base;
  if (process.env.E2E_BASE_URL) {
    base = process.env.E2E_BASE_URL.replace(/\/+$/, '');
  } else {
    server = await startServer({ port, dbPath, root: ROOT });
    base = server.url;
  }

  page = await launch({ port: cdpPort, userDataDir });
  if (opts.init) await page.addInitScript(typeof opts.init === 'function' ? await opts.init({ base }) : opts.init);
  await page.goto(base + (opts.path ?? '/'));
  await page.waitFor(GAME_READY);

  return fn({ page, base, shotDir });
}
