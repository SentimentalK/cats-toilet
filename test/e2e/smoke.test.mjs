import test from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { withGame } from './harness.mjs';

const isGuestProbe401 = (e) =>
  e.type === 'error' &&
  e.status === 401 &&
  typeof e.url === 'string' &&
  e.url.endsWith('/api/me') &&
  typeof e.text === 'string' &&
  e.text.includes('Failed to load resource');

test('smoke：房间加载、无 console 错误、能截图', { timeout: 60_000 }, async (t) => {
  await withGame(t, async ({ page, shotDir }) => {
    assert.equal(await page.count('#room'), 1);
    assert.match(await page.evaluate('document.title'), /猫厕所/);
    assert.equal(await page.evaluate('typeof window.__game'), 'object');

    const file = `${shotDir}/smoke.png`;
    await page.shot(file);
    const info = await stat(file);
    assert.ok(info.size > 20_000, `screenshot too small: ${info.size} bytes`);

    const unexpected = page.errors.filter((e) => !isGuestProbe401(e));
    assert.deepEqual(unexpected, []);

    const allowed = page.errors.filter(isGuestProbe401);
    assert.equal(allowed.length, 1);
    console.log(`[e2e] allowed guest /api/me 401: ${allowed.length}`);
  });
});
