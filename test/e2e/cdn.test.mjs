import test from 'node:test';
import assert from 'node:assert/strict';
import { withGame } from './harness.mjs';
import { freshSave, makeUser, seedScript, GAME_READY, ROOM } from './seed.mjs';

const PORTS = { port: 8793, cdpPort: 9558 };
const RUNTIME_DIR = '/home/sentimentalk/codes/temp/cat-005/e2e';
const SHOT_DIR = '/home/sentimentalk/codes/temp/cat-005/screenshots';

test('CAT-005 — second load serves js/css from the SW cache', { timeout: 120_000 }, async (t) => {
  await withGame(
    t,
    async ({ page, base }) => {
      await page.waitFor('navigator.serviceWorker.ready.then(() => true)', 20_000);
      await page.waitFor('!!navigator.serviceWorker.controller', 10_000);

      page.network.length = 0;
      await page.goto(base + ROOM);
      await page.waitFor(GAME_READY);

      for (const path of ['/js/game.js', '/css/style.css']) {
        const rows = page.network.filter((r) => r.url === base + path);
        // a cloud-save adoption may reload the document, so the path can be
        // requested more than once; every response must still be a cache hit
        assert.ok(rows.length >= 1, `${path} was never requested`);
        for (const row of rows) {
          assert.equal(row.status, 200, `${path} status`);
          assert.equal(row.fromServiceWorker, true, `${path} served by SW`);
          assert.equal(row.headers['x-sw-cache'], 'hit', `${path} cache-first hit`);
        }
      }
    },
    {
      ...PORTS,
      runtimeDir: RUNTIME_DIR,
      shotDir: SHOT_DIR,
      init: async ({ base }) => seedScript({ token: (await makeUser(base)).token, save: freshSave() }),
      path: ROOM,
    },
  );
});
