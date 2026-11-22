import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

function dryRun(env = {}) {
  const out = execFileSync(process.execPath, ['tools/cf-cache-rules.mjs', '--dry-run'], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

test('Cloudflare cache rules are scoped to the cats host by default', () => {
  const payload = dryRun({ CF_HOST: '' });
  assert.equal(payload.body.rules.length, 3);
  for (const rule of payload.body.rules) {
    assert.match(rule.expression, /http\.host eq "cats\.mainstayx\.com"/);
    assert.equal(rule.action, 'set_cache_settings');
  }
  assert.match(payload.body.rules[0].expression, /\/sw\.js/);
  assert.match(payload.body.rules[1].expression, /\/assets\//);
  assert.match(payload.body.rules[2].expression, /\/js\//);
});

test('CF_HOST overrides the scope for another deployment', () => {
  const payload = dryRun({ CF_HOST: 'example.test' });
  for (const rule of payload.body.rules) {
    assert.match(rule.expression, /http\.host eq "example\.test"/);
    assert.doesNotMatch(rule.expression, /cats\.mainstayx\.com/);
  }
});
